// 参数页保留旧预览，250ms 合并输入；任务带版本，只有最新成功结果允许下一步。
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import type { PatternPixels } from '@/lib/engine/pattern-recognition';
import { CREATIVE_MODE_SETTINGS } from '@/lib/engine/creative-mode';
import { Action, Choices, NumberField, Section, SliderField } from '../components/controls';
import { Page, ui } from '../components/page';
import { PatternBoard } from '../components/pattern-board';
import { BRANDS, createPatternAsync, getPalette, type Settings } from '../services/pattern';
import { readPixels } from '../services/image';
import { fitSize } from '../services/editor';
import { PreviewQueue } from '../services/preview-queue';
import { useStudio, type Conversion } from '../state/studio';

type Job = { conversion: Conversion; key: string };
type Result = Awaited<ReturnType<typeof createPatternAsync>>;
export function Parameters() {
  const studio = useStudio();
  const { conversion, setConversion } = studio;
  const { source, settings, mode } = conversion;
  const [focused, setFocused] = useState(false);
  const [more, setMore] = useState(false);
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState<{ result: Result; key: string } | null>(null);
  const [failure, setFailure] = useState<{ message: string; key: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify(conversion);
  const latest = useRef(key);
  useLayoutEffect(() => { latest.current = key; }, [key]);
  const pixelCache = useRef<{ uri: string; promise: Promise<PatternPixels> } | null>(null);
  const queue = useRef<PreviewQueue<Job, Result> | null>(null);
  useEffect(() => {
    const worker = new PreviewQueue<Job, Result>(async ({ conversion }, cancelled) => {
    if (!conversion.source) throw new Error('请先选择图片');
    const uri = conversion.source.uri;
    if (pixelCache.current?.uri !== uri) {
      const promise = readPixels(uri).catch(error => { pixelCache.current = null; throw error; });
      pixelCache.current = { uri, promise };
    }
    const pixels = await pixelCache.current.promise;
    return createPatternAsync(pixels, conversion.settings, conversion.mode, cancelled);
  }, (result, job) => { setPreview({ result, key: job.key }); setFailure(null); }, error => {
    setFailure({ message: error instanceof Error ? error.message : '生成失败，请重试', key: latest.current });
    });
    queue.current = worker;
    return () => worker.stop();
  }, []);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => { setFocused(false); queue.current?.stop(); };
  }, []));
  useEffect(() => {
    if (!focused || !source) return;
    const worker = queue.current!;
    worker.request({ conversion, key });
    return () => worker.stop();
  }, [conversion, source, key, retry, focused]);
  const fresh = preview?.key === key && failure?.key !== key;
  const generating = !!source && !fresh && failure?.key !== key;
  function change(patch: Partial<Settings>) { setConversion(previous => ({ ...previous, settings: { ...previous.settings, ...patch } })); }
  function next() {
    if (!fresh || !preview) return;
    const snapshot = preview;
    const apply = () => {
      if (latest.current !== snapshot.key) return;
      studio.updateDraft('conversion', () => ({ pattern: snapshot.result.pattern, completed: [], elapsed: 0, edited: false }));
      router.navigate({ pathname: '/workbench', params: { kind: 'conversion' } });
    };
    if (studio.drafts.conversion && (studio.drafts.conversion.edited || studio.drafts.conversion.completed.length > 0 || studio.drafts.conversion.elapsed > 0)) {
      Alert.alert('应用新图纸？', '重新生成将覆盖格子编辑和拼豆进度。原作品在确认前仍会保留。', [
        { text: '保留作品', style: 'cancel' }, { text: '替换图纸', style: 'destructive', onPress: apply },
      ]);
    } else apply();
  }
  const palette = getPalette(settings.brand);
  const colors = palette.filter(color => `${color.code} ${color.name}`.toLowerCase().includes(search.toLowerCase()));
  const series = [...new Set(palette.map(color => color.code.match(/^[^\d]+/)?.[0] || color.code[0]))];
  function toggleSeries(prefix: string) {
    const ids = palette.filter(color => (color.code.match(/^[^\d]+/)?.[0] || color.code[0]) === prefix).map(color => color.id);
    change({ excluded: ids.every(id => settings.excluded.includes(id)) ? settings.excluded.filter(id => !ids.includes(id)) : [...new Set([...settings.excluded, ...ids])] });
  }
  return <Page title="调出你的拼豆配色" footer={<Action title={generating ? '正在生成最新图纸…' : '下一步 →'} active disabled={!fresh} onPress={next} />}>
    {!source ? <Text style={ui.note}>请返回首页选择图片。</Text> : <>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1, gap: 10 }}><Text style={ui.label}>原图</Text><Image source={{ uri: source.uri }} resizeMode="contain" style={{ width: '100%', height: 175, borderRadius: 14, backgroundColor: '#ffffff' }} />
          <Action title="重新编辑" onPress={() => { studio.setPendingImage(source); router.push('/image-edit'); }} /></View>
        <View style={{ flex: 2.2, gap: 10 }}><Text style={ui.label}>效果预览</Text>
          <View style={{ minHeight: 280 }}>
            {preview ? <PatternBoard pattern={preview.result.pattern} palette={preview.result.palette} height={230} /> : <View style={{ height: 280, backgroundColor: '#ffffff', borderRadius: 14 }} />}
            {generating && <View pointerEvents="none" style={{ position: 'absolute', inset: 0, backgroundColor: '#ffffffbb', justifyContent: 'center', alignItems: 'center', gap: 10, borderRadius: 14 }}>
              <ActivityIndicator color="#df4b89" /><Text style={ui.note}>图纸生成中</Text></View>}
          </View></View>
      </View>
      {failure?.key === key && <View style={{ gap: 10 }}><Text accessibilityRole="alert" style={ui.error}>{failure.message}</Text><Action title="重试生成" onPress={() => { setFailure(null); setRetry(value => value + 1); }} /></View>}
      <Text style={ui.note}>{settings.width} × {settings.height} 颗 · 修改参数后自动更新，双指操作效果图。</Text>
      <Section title="图纸参数">
        <Text style={ui.label}>拼豆品牌</Text><Choices items={BRANDS} value={settings.brand} onChange={brand => change({ brand, excluded: [] })} />
        <View style={{ backgroundColor: '#fdf8fb', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, gap: 2 }}>
          <SliderField title="最长边" value={Math.max(settings.width, settings.height)} minimum={1} maximum={200}
            onChange={value => change(fitSize(value, source.width, source.height))} />
          <SliderField title="颜色数量" value={settings.maxColors} minimum={1} maximum={256} onChange={maxColors => change({ maxColors })} />
          {(['brightness', 'contrast', 'saturation'] as const).map((name, index) => <SliderField key={name} title={['亮度', '对比度', '饱和度'][index]}
            value={settings[name]} minimum={-100} maximum={100} onChange={value => change({ [name]: value })} />)}
        </View>
        <Action title={more ? '收起更多设置' : '更多设置 ⌄'} onPress={() => setMore(value => !value)} />
        {more && <>
          <Text style={ui.label}>处理方式</Text><Choices items={[["generate", "图片生成"], ["recognize", "图纸识别"], ["highlight", "色号高亮"]]} value={mode}
            onChange={mode => setConversion(previous => ({ ...previous, mode }))} />
          {mode !== 'generate' ? <Action title={settings.autoGrid ? '自动网格：开' : '自动网格：关'} onPress={() => change({ autoGrid: !settings.autoGrid })} /> : <>
            <Text style={ui.label}>创作模式</Text><Choices items={Object.entries(CREATIVE_MODE_SETTINGS).map(([name, preset]) => [name as Settings['creative'], preset.label] as const)} value={settings.creative} onChange={creative => change({ creative })} />
            <Text style={ui.label}>抖动方式</Text><Choices items={[["none", "关闭"], ["floyd-steinberg", "误差扩散"], ["ordered", "有序抖动"]]} value={settings.dithering} onChange={dithering => change({ dithering })} />
            <Text style={ui.label}>透明区域处理</Text><Choices items={[["white", "白底"], ["black", "黑底"], ["transparent", "留空"]]} value={settings.background} onChange={background => change({ background })} />
          </>}
          <View style={ui.row}><NumberField title="宽度（颗）" value={settings.width} onChange={width => change({ width: Math.max(1, Math.min(200, Math.round(width) || 1)) })} />
            <NumberField title="高度（颗）" value={settings.height} onChange={height => change({ height: Math.max(1, Math.min(200, Math.round(height) || 1)) })} /></View>
          <Text style={ui.note}>手动宽高可用于识别固定颗数的图纸；修改最长边会恢复图片比例。</Text>
          <Text style={ui.label}>色板筛选 · 已排除 {settings.excluded.length} 色</Text>
          <TextInput accessibilityLabel="搜索色号" placeholder="搜索色号或名称" value={search} onChangeText={setSearch} style={ui.input} />
          <View style={ui.row}>{series.map(prefix => <Action key={prefix} title={`${prefix} 系`} onPress={() => toggleSeries(prefix)} />)}
            <Action title="恢复全部颜色" onPress={() => change({ excluded: [] })} /></View>
          <View style={ui.row}>{colors.map(color => <View key={color.id} style={ui.row}><View style={[ui.swatch, { backgroundColor: color.hex }]} />
            <Action title={color.code} active={!settings.excluded.includes(color.id)} onPress={() => change({ excluded: settings.excluded.includes(color.id) ? settings.excluded.filter(id => id !== color.id) : [...settings.excluded, color.id] })} />
          </View>)}</View>
        </>}
      </Section>
    </>}
  </Page>;
}
