// 参数页保留旧预览，250ms 合并输入；任务带版本，只有最新成功结果允许下一步。
// 进入页面生成一次，后续由预览按钮或下一步主动提交，修改参数只取消过期任务。
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
import { showSuccess } from '../services/feedback';
import { useStudio, type Conversion } from '../state/studio';

type Job = { conversion: Conversion; key: string; advance: boolean };
type Result = Awaited<ReturnType<typeof createPatternAsync>>;
// 编辑生成参数并按需提交预览，下一步始终采用当前设置。
export function Parameters() {
  const studio = useStudio();
  const { conversion, setConversion } = studio;
  const { source, settings, mode } = conversion;
  const [focused, setFocused] = useState(false);
  const [more, setMore] = useState(false);
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState<{ result: Result; key: string } | null>(null);
  const [failure, setFailure] = useState<{ message: string; key: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const key = JSON.stringify(conversion);
  const latest = useRef({ conversion, key });
  const running = useRef<Job | null>(null);
  const previewRef = useRef(preview);
  const applyRef = useRef(apply);
  useLayoutEffect(() => {
    latest.current = { conversion, key };
    if (running.current && running.current.key !== key) {
      queue.current?.stop(); running.current = null; setGenerating(false); setFailure(null);
    }
  }, [conversion, key]);
  useLayoutEffect(() => { applyRef.current = apply; });
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
  }, (result, job) => {
    running.current = null; setGenerating(false);
    previewRef.current = { result, key: job.key };
    setPreview(previewRef.current); setFailure(null);
    showSuccess('生成成功');
    if (job.advance) applyRef.current(result, job.key);
  }, error => {
    running.current = null; setGenerating(false);
    setFailure({ message: error instanceof Error ? error.message : '生成失败，请重试', key: latest.current.key });
    });
    queue.current = worker;
    return () => worker.stop();
  }, []);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => { setFocused(false); queue.current?.stop(); running.current = null; };
  }, []));
  const sourceUri = source?.uri;
  useEffect(() => {
    if (!focused || !sourceUri || !studio.ready) return;
    const current = latest.current;
    if (previewRef.current?.key === current.key) return;
    const worker = queue.current!;
    const job = { ...current, advance: false };
    running.current = job; setGenerating(true); setFailure(null);
    worker.request(job, 0);
    return () => { worker.stop(); running.current = null; setGenerating(false); };
  }, [sourceUri, focused, studio.ready]);
  const fresh = preview?.key === key && failure?.key !== key;
  // 保存参数到现有本地缓存；在小色板品牌下限制可选上限。
  function change(patch: Partial<Settings>) {
    setConversion(previous => {
      const settings = { ...previous.settings, ...patch };
      settings.maxColors = Math.min(settings.maxColors, Math.max(1, getPalette(settings.brand).filter(color => !settings.excluded.includes(color.id)).length));
      return { ...previous, settings };
    });
  }
  // 主动提交当前快照，避免连续点击产生重复计算。
  function generate(advance = false) {
    if (!source || running.current) return;
    const job = { conversion, key, advance };
    running.current = job; setGenerating(true); setFailure(null);
    queue.current?.request(job, 0);
  }
  // 只将仍与当前参数一致的成功图纸写入工作台。
  function apply(result: Result, resultKey: string) {
    if (latest.current.key !== resultKey) return;
    studio.updateDraft('conversion', () => ({ pattern: result.pattern, completed: [], elapsed: 0, edited: false }));
    router.navigate({ pathname: '/workbench', params: { kind: 'conversion' } });
  }
  // 先确认草稿替换，再复用当前预览或生成最新图纸后进入下一步。
  function next() {
    if (!source || running.current) return;
    // 系统确认框停留期间参数可能变化，提交前再次核对快照。
    const proceed = () => {
      if (latest.current.key !== key) return;
      if (fresh && preview) apply(preview.result, key);
      else generate(true);
    };
    if (studio.drafts.conversion && (studio.drafts.conversion.edited || studio.drafts.conversion.completed.length > 0 || studio.drafts.conversion.elapsed > 0)) {
      Alert.alert('应用新图纸？', '重新生成将覆盖格子编辑和拼豆进度。原作品在确认前仍会保留。', [
        { text: '保留作品', style: 'cancel' }, { text: '替换图纸', style: 'destructive', onPress: proceed },
      ]);
    } else proceed();
  }
  const palette = getPalette(settings.brand);
  const availableColors = Math.max(1, palette.filter(color => !settings.excluded.includes(color.id)).length);
  const colors = palette.filter(color => `${color.code} ${color.name}`.toLowerCase().includes(search.toLowerCase()));
  const series = [...new Set(palette.map(color => color.code.match(/^[^\d]+/)?.[0] || color.code[0]))];
  // 按色号前缀批量排除或恢复颜色。
  function toggleSeries(prefix: string) {
    const ids = palette.filter(color => (color.code.match(/^[^\d]+/)?.[0] || color.code[0]) === prefix).map(color => color.id);
    change({ excluded: ids.every(id => settings.excluded.includes(id)) ? settings.excluded.filter(id => !ids.includes(id)) : [...new Set([...settings.excluded, ...ids])] });
  }
  return <Page title="调出你的拼豆配色" footer={
    /* 底部两个操作用弹性布局共享宽度，适应不同设备。 */
    <View style={ui.row}><View style={{ flex: 1 }}><Action title={generating ? '生成中…' : '预览'} disabled={!source || generating} onPress={() => generate()} /></View>
      <View style={{ flex: 1.5 }}><Action title={generating ? '正在生成…' : '下一步 →'} active disabled={!source || generating} onPress={next} /></View></View>}>
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
      {failure?.key === key && <View style={{ gap: 10 }}><Text accessibilityRole="alert" style={ui.error}>{failure.message}</Text><Action title="重试生成" onPress={() => generate()} /></View>}
      <Text style={ui.note}>{settings.width} × {settings.height} 颗 · {fresh ? '预览已更新，双指操作效果图。' : generating ? '正在生成当前参数的图纸…' : '参数已修改，点击预览或下一步生成。'}</Text>
      <Section title="图纸参数">
        <Text style={ui.label}>拼豆品牌</Text><Choices items={BRANDS} value={settings.brand} onChange={brand => change({ brand, excluded: [], maxColors: Math.min(settings.maxColors, getPalette(brand).length) })} />
        <View style={{ backgroundColor: '#fdf8fb', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, gap: 2 }}>
          <SliderField title="最长边" value={Math.max(settings.width, settings.height)} minimum={1} maximum={200}
            onChange={value => change(fitSize(value, source.width, source.height))} />
          <SliderField title="颜色上限" value={Math.min(settings.maxColors, availableColors)} minimum={1} maximum={availableColors} onChange={maxColors => change({ maxColors })} />
          {(['brightness', 'contrast', 'saturation'] as const).map((name, index) => <SliderField key={name} title={['亮度', '对比度', '饱和度'][index]}
            value={settings[name]} minimum={-100} maximum={100} onChange={value => change({ [name]: value })} />)}
        </View>
        <Text style={ui.note}>亮度、对比度、饱和度：0 表示按原图、不做额外调整；向左减弱，向右增强。实际用色可能少于上限。</Text>
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
