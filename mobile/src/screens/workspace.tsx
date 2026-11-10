// 本文件实现原生拼豆工作台，包含选图、生成、识别、编辑、专注拼豆和导出。
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, BackHandler, Image, ScrollView, StyleSheet, Text, TextInput, View, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Host, Switch } from '@expo/ui';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { Stack } from 'expo-router/stack';
import type { BeadPattern, CompiledBeadColor } from '@/lib/types/bead';
import { calculateUsage } from '@/lib/utils/usage-calculator';
import { CREATIVE_MODE_SETTINGS } from '@/lib/engine/creative-mode';
import { Action, Choices, NumberField, Section } from '../components/controls';
import { PatternBoard } from '../components/pattern-board';
import { BRANDS, DEFAULT_SETTINGS, createPattern, getPalette, validSize, type Settings, type WorkMode } from '../services/pattern';
import { readPixels } from '../services/image';
import { importProject, saveImage, shareImage, sharePdf, shareProject, shareUsage, validateProject } from '../services/export';

const STORAGE_KEY = 'pindo-native-workspace-v1';
const MODES = [['generate', '图片生成'], ['recognize', '图纸识别'], ['highlight', '色号高亮']] as const;

// 为异常提供可直接显示的中文提示。
function errorMessage(error: unknown) { return error instanceof Error ? error.message : '操作失败，请重试。'; }

// 格式化本地专注计时。
function formatTime(seconds: number) {
  return `${Math.floor(seconds / 3600).toString().padStart(2, '0')}:${Math.floor(seconds / 60 % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

// 组合原生工作流并在本机保存图纸和拼豆进度。
export function Workspace() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [mode, setMode] = useState<WorkMode>('generate');
  const [source, setSource] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [pattern, setPattern] = useState<BeadPattern | null>(null);
  const [palette, setPalette] = useState<CompiledBeadColor[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [completed, setCompleted] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [focus, setFocus] = useState(false);
  const [running, setRunning] = useState(false);
  const [editing, setEditing] = useState(false);
  const [paintColor, setPaintColor] = useState('');
  const [undo, setUndo] = useState<BeadPattern[]>([]);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('选择照片生成图纸，或导入已有拼豆图纸进行识别。');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showPalette, setShowPalette] = useState(false);
  const mounted = useRef(true);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const usage = useMemo(() => pattern ? calculateUsage(pattern, palette) : [], [pattern, palette]);
  const total = usage.reduce((sum, item) => sum + item.count, 0);
  const brandPalette = getPalette(settings.brand);
  const visibleColors = brandPalette.filter(color => `${color.code} ${color.name}`.toLowerCase().includes(search.toLowerCase()));
  const series = [...new Set(brandPalette.map(color => color.code.match(/^[^\d]+/)?.[0] || color.code[0]))];

  // 切换专注工作区时回到顶部，确保暂停和返回按钮始终可找到。
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [focus]);

  // 首次打开恢复本地工程，失败时保留错误并允许重新开始。
  useEffect(() => {
    mounted.current = true;
    void AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (!raw || !mounted.current) return;
      const restored = validateProject(JSON.parse(raw));
      setPattern(restored.pattern);
      setPalette(getPalette(restored.pattern.metadata.brand as Settings['brand']));
      setCompleted(restored.completed);
      setElapsed(restored.elapsed);
      setSettings(previous => ({ ...previous, brand: restored.pattern.metadata.brand as Settings['brand'], width: restored.pattern.metadata.width, height: restored.pattern.metadata.height }));
      setMessage('已恢复上次图纸与拼豆进度。');
    }).catch(error => { if (mounted.current) setError(`恢复失败：${errorMessage(error)}`); })
      .finally(() => { if (mounted.current) setReady(true); });
    return () => { mounted.current = false; };
  }, []);

  // 延迟写入工程，并在进入后台时立即保存，避免打断格子连续操作。
  useEffect(() => {
    if (!ready || !pattern) return;
    const snapshot = JSON.stringify({ pattern, completed, elapsed });
    // 将写入失败反馈给用户，保留内存中的编辑内容。
    function persist() { void AsyncStorage.setItem(STORAGE_KEY, snapshot).catch(error => setError(`保存进度失败：${errorMessage(error)}`)); }
    const timeout = setTimeout(persist, 500);
    const listener = AppState.addEventListener('change', state => { if (state !== 'active') persist(); });
    return () => { clearTimeout(timeout); listener.remove(); };
  }, [pattern, completed, elapsed, ready]);

  // 专注计时仅在用户开始且应用位于前台时递增。
  useEffect(() => {
    if (!focus || !running || !pattern) return;
    const timer = setInterval(() => { if (AppState.currentState === 'active') setElapsed(value => value + 1); }, 1000);
    return () => clearInterval(timer);
  }, [focus, running, pattern]);

  // 安卓返回键优先退出专注工作区。
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!focus) return false;
      setFocus(false); setRunning(false); return true;
    });
    return () => listener.remove();
  }, [focus]);

  // 统一执行异步操作，展示处理中和错误状态，避免重复提交。
  async function perform(task: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError('');
    try { await task(); } catch (error) { setError(errorMessage(error)); scroll.current?.scrollTo({ y: 0, animated: false }); }
    finally { if (mounted.current) setBusy(false); }
  }

  // 使用系统相册选择器读取单张图片，取消时保持当前图纸。
  async function chooseImage(crop = false) {
    await perform(async () => {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: crop });
      if (result.canceled) return;
      const asset = result.assets[0];
      setSource(asset);
      if (settings.lockRatio && mode === 'generate') setSettings(previous => ({ ...previous, height: validSize(previous.width * asset.height / asset.width) }));
      setMessage('图片已选好，调整参数后点击生成或识别。');
    });
  }

  // 解码原生图片并执行本地图纸算法，成功后清除旧图纸的专注进度。
  async function generate() {
    if (!source) { setError('请先从相册选择图片。'); return; }
    await perform(async () => {
      setMessage(mode === 'generate' ? '正在生成图纸…' : '正在识别网格和色号…');
      const pixels = await readPixels(source.uri);
      const result = createPattern(pixels, settings, mode);
      setPattern(result.pattern); setPalette(result.palette); setSelected([]); setCompleted([]); setElapsed(0); setUndo([]);
      setPaintColor(result.palette[0]?.id || '');
      setMessage(mode === 'generate' ? '图纸已生成，选择色号可以高亮查看。' : `识别完成：${result.gridSource?.startsWith('auto') ? '已自动识别网格' : '已按设置颗数切分'}。`);
    });
  }

  // 更新颗数并在图片模式按原图比例同步另一边。
  function changeSize(axis: 'width' | 'height', value: number) {
    const size = validSize(value);
    setSettings(previous => ({ ...previous, [axis]: size,
      ...(previous.lockRatio && source && mode === 'generate' ? axis === 'width'
        ? { height: validSize(size * source.height / source.width) }
        : { width: validSize(size * source.width / source.height) } : {}),
    }));
  }

  // 切换高亮颜色，保留多色选择。
  function toggleSelected(id: string) { setSelected(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]); }

  // 在专注模式标记完成，在编辑模式替换颜色，普通模式查看格子色号。
  function pressCell(row: number, col: number) {
    if (!pattern || busy) return;
    const cell = pattern.cells[row][col];
    if (cell.isEmpty) return;
    if (focus) {
      if (selected.length && !selected.includes(cell.colorId)) return;
      const key = `${row},${col}`;
      setCompleted(previous => previous.includes(key) ? previous.filter(value => value !== key) : [...previous, key]);
    } else if (editing && paintColor) {
      setUndo(previous => [...previous.slice(-19), pattern]);
      setPattern({ ...pattern, cells: pattern.cells.map((cells, index) => index === row ? cells.map((value, index) => index === col ? { colorId: paintColor } : value) : cells) });
      setCompleted(previous => previous.filter(value => value !== `${row},${col}`));
    } else {
      setSelected([cell.colorId]);
      setMessage(`第 ${row + 1} 行，第 ${col + 1} 列：${palette.find(color => color.id === cell.colorId)?.code || ''}`);
    }
  }

  // 同步切换整个色系的排除状态，保证筛选可再次撤销。
  function toggleSeries(prefix: string) {
    const ids = brandPalette.filter(color => (color.code.match(/^[^\d]+/)?.[0] || color.code[0]) === prefix).map(color => color.id);
    setSettings(previous => ({ ...previous, excluded: ids.every(id => previous.excluded.includes(id))
      ? previous.excluded.filter(id => !ids.includes(id)) : [...new Set([...previous.excluded, ...ids])] }));
  }

  // 导入可编辑工程并恢复颗粒完成状态。
  async function loadProject() {
    await perform(async () => {
      const result = await importProject();
      if (!result) return;
      setPattern(result.pattern); setPalette(getPalette(result.pattern.metadata.brand as Settings['brand']));
      setCompleted(result.completed); setElapsed(result.elapsed); setSelected([]); setUndo([]); setSource(null);
      setSettings(previous => ({ ...previous, brand: result.pattern.metadata.brand as Settings['brand'], width: result.pattern.metadata.width, height: result.pattern.metadata.height, excluded: [] }));
      setMessage('工程已导入，可继续编辑和拼豆。');
    });
  }

  if (!ready) return <SafeAreaView style={styles.loading}><ActivityIndicator size="large" color="#176b4d" /><Text>正在恢复本地图纸…</Text></SafeAreaView>;
  return <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.screen}>
    <Stack.Screen options={{ title: focus ? '专注拼豆' : 'Pindo 拼豆' }} />
    <View style={styles.header}>
      <Text style={styles.subtitle}>{focus ? `${formatTime(elapsed)} · ${completed.length}/${total} 颗完成` : '把喜欢的图片，变成一颗颗色彩。'}</Text></View>
    <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic">
      {error ? <Text accessibilityRole="alert" selectable style={styles.error}>{error}</Text> : null}
      <View style={styles.status}>{busy && <ActivityIndicator color="#176b4d" />}<Text selectable style={styles.body}>{message}</Text></View>
      {!focus && <>
        <Choices items={MODES} value={mode} onChange={setMode} />
        <Section title="图片与工程">
          <View style={styles.row}><Action title="从相册选图" onPress={() => void chooseImage()} disabled={busy} />
            <Action title="选图并裁剪" onPress={() => void chooseImage(true)} disabled={busy} />
            <Action title="导入工程" onPress={() => void loadProject()} disabled={busy} /></View>
          {source && <Image source={{ uri: source.uri }} resizeMode="contain" style={styles.source} accessibilityLabel="选中的原始图片" />}
        </Section>
        <Section title="图纸设置">
          <Choices items={BRANDS} value={settings.brand} onChange={brand => { setSettings(previous => ({ ...previous, brand, excluded: [] })); setSearch(''); }} />
          <View style={styles.row}><NumberField title="宽度（颗）" value={settings.width} onChange={value => changeSize('width', value)} />
            <NumberField title="高度（颗）" value={settings.height} onChange={value => changeSize('height', value)} /></View>
          <Text style={styles.note}>范围 1–200 颗。有网格图纸优先自动识别，无网格时按上述颗数切分。</Text>
          <Host matchContents><Switch label="锁定原图宽高比" value={settings.lockRatio} onValueChange={lockRatio => setSettings(previous => ({ ...previous, lockRatio }))} /></Host>
          {mode !== 'generate' && <><Host matchContents><Switch label="自动识别网格" value={settings.autoGrid}
            onValueChange={autoGrid => setSettings(previous => ({ ...previous, autoGrid }))} /></Host>
            <Text style={styles.note}>含文字或图例的图纸建议先裁剪。识别颗数不正确时，关闭自动识别并手动设置宽高。</Text></>}
          {mode === 'generate' && <>
            <Text style={styles.label}>创作模式</Text>
            <Choices items={Object.entries(CREATIVE_MODE_SETTINGS).map(([key, value]) => [key, value.label] as const)} value={settings.creative}
              onChange={creative => setSettings(previous => ({ ...previous, creative: creative as Settings['creative'] }))} />
            <NumberField title="最多颜色数" value={settings.maxColors} onChange={maxColors => setSettings(previous => ({ ...previous, maxColors: Math.max(1, Math.min(256, Math.round(maxColors) || 1)) }))} />
            <Text style={styles.label}>颜色抖动</Text>
            <Choices items={['none', 'floyd-steinberg', 'ordered'].map((key, index) => [key, ['关闭', '误差扩散', '有序抖动'][index]] as const)} value={settings.dithering}
              onChange={dithering => setSettings(previous => ({ ...previous, dithering: dithering as Settings['dithering'] }))} />
            <Text style={styles.label}>透明区域处理</Text>
            <Choices items={[["white", "白底"], ["black", "黑底"], ["transparent", "留空"]]} value={settings.background}
              onChange={background => setSettings(previous => ({ ...previous, background }))} />
          </>}
          <Action title={showPalette ? '收起色板筛选' : `色板筛选 · 已排除 ${settings.excluded.length} 色`} onPress={() => setShowPalette(value => !value)} />
          {showPalette && <>
            <TextInput accessibilityLabel="搜索色号" placeholder="搜索色号或颜色名称" value={search} onChangeText={setSearch} style={styles.search} />
            <View style={styles.row}>{series.map(prefix => <Action key={prefix} title={`${prefix} 色系`} onPress={() => toggleSeries(prefix)} />)}
              <Action title="恢复全部颜色" onPress={() => setSettings(previous => ({ ...previous, excluded: [] }))} /></View>
            <ScrollView nestedScrollEnabled style={styles.colorScroller}><View style={styles.row}>{visibleColors.map(color => <View key={color.id} style={styles.colorOption}>
              <View style={[styles.swatch, { backgroundColor: color.hex }]} />
              <Action title={`${settings.excluded.includes(color.id) ? '已排除 ' : ''}${color.code}`} active={!settings.excluded.includes(color.id)}
                onPress={() => setSettings(previous => ({ ...previous, excluded: previous.excluded.includes(color.id) ? previous.excluded.filter(id => id !== color.id) : [...previous.excluded, color.id] }))} />
            </View>)}</View></ScrollView>
          </>}
          <Action title={busy ? '处理中…' : mode === 'generate' ? '生成拼豆图纸' : '识别图纸与色号'} active onPress={() => void generate()} disabled={busy || !source} />
        </Section>
      </>}
      {pattern ? <>
        <Section title={`${pattern.metadata.width} × ${pattern.metadata.height} 颗 · ${usage.length} 色 · 共 ${total} 颗`}>
          {focus ? <View style={styles.row}>
            <Action title={running ? '暂停计时' : '继续计时'} active={running} onPress={() => setRunning(value => !value)} />
            <Action title="返回工作台" onPress={() => { setFocus(false); setRunning(false); }} />
            <Action title="重置完成标记" onPress={() => { setCompleted([]); setElapsed(0); }} />
          </View> : <View style={styles.row}>
            <Action title="专注拼豆" onPress={() => { setFocus(true); setRunning(true); setEditing(false); setSelected([]); }} />
            <Action title={editing ? '结束编辑' : '编辑格子'} active={editing} onPress={() => { setEditing(value => !value); setSelected([]); }} />
            <Action title="撤销编辑" disabled={!undo.length || busy} onPress={() => { setPattern(undo[undo.length - 1]); setUndo(previous => previous.slice(0, -1)); }} />
          </View>}
          <PatternBoard key={pattern.metadata.createdAt} pattern={pattern} palette={palette} selected={selected} completed={focus ? completed : []} onCell={pressCell} />
          {focus && <Text style={styles.note}>{total > 0 && completed.length === total ? '全部拼好啦！可以导出保存作品。' : '点击格子标记完成，再点一次撤销。选择色号后只操作该颜色。'}</Text>}
          {editing && <><Text style={styles.label}>先选择画笔颜色，再点击图纸格子。</Text><ScrollView horizontal><View style={styles.rowNoWrap}>
            {palette.map(color => <View key={color.id} style={styles.colorOption}><View style={[styles.swatch, { backgroundColor: color.hex }]} />
              <Action title={color.code} active={paintColor === color.id} onPress={() => setPaintColor(color.id)} /></View>)}
          </View></ScrollView></>}
        </Section>
        <Section title="色号与用量">
          <Text style={styles.note}>按 29 × 29 颗拼板计算，需要 {Math.ceil(pattern.metadata.width / 29) * Math.ceil(pattern.metadata.height / 29)} 块拼板。</Text>
          <Action title="显示全部颜色" onPress={() => setSelected([])} />
          <View style={styles.row}>{usage.map(item => <View key={item.colorId} style={styles.colorOption}>
            <View style={[styles.swatch, { backgroundColor: item.color.hex }]} />
            <Action title={`${item.color.code} × ${item.count}`} active={selected.includes(item.colorId)} onPress={() => toggleSelected(item.colorId)} />
          </View>)}</View>
        </Section>
        {!focus && <Section title="保存与分享">
          <View style={styles.row}>
            <Action title="保存 PNG 到相册" disabled={busy} onPress={() => void perform(async () => { await saveImage(pattern, palette); setMessage('图纸已保存到相册。'); })} />
            <Action title="分享 PNG" disabled={busy} onPress={() => void perform(() => shareImage(pattern, palette))} />
            <Action title="导出 PDF" disabled={busy} onPress={() => void perform(() => sharePdf(pattern, palette))} />
            <Action title="导出用量 CSV" disabled={busy} onPress={() => void perform(() => shareUsage(pattern, palette))} />
            <Action title="导出工程" disabled={busy} onPress={() => void perform(() => shareProject(pattern, completed, elapsed))} />
          </View><Text style={styles.note}>图纸和拼豆进度自动保存在本机。导出工程可以备份并在以后继续编辑。</Text>
        </Section>}
      </> : <Section title="等待第一张图纸"><Text style={styles.body}>从相册选择图片，然后点击生成。已有无色号图纸可切换到“图纸识别”。</Text></Section>}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  // 根视图占满安全区域，适应横竖屏。
  screen: { flex: 1, backgroundColor: '#f3f5ef' },
  // 恢复状态居中显示。
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, backgroundColor: '#f3f5ef' },
  // 顶部应用标题区。
  header: { paddingHorizontal: 20, paddingVertical: 14, gap: 5 },
  // 顶部说明和计时信息。
  subtitle: { fontSize: 13, color: '#65746c', fontVariant: ['tabular-nums'] },
  // 工作台内容居中并允许平板扩展。
  content: { padding: 16, gap: 16, width: '100%', maxWidth: 900, alignSelf: 'center', paddingBottom: 40 },
  // 错误消息使用明确边框与文字颜色。
  error: { padding: 14, borderRadius: 12, backgroundColor: '#ffe9e5', color: '#9c2f22', lineHeight: 21 },
  // 状态消息与加载指示器横向排列。
  status: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  // 通用正文。
  body: { flexShrink: 1, color: '#52645b', lineHeight: 22 },
  // 通用弹性行，空间不足时自动换行。
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  // 横向滚动色板保持单行。
  rowNoWrap: { flexDirection: 'row', gap: 8 },
  // 原始图片预览按可用宽度显示。
  source: { width: '100%', height: 180, backgroundColor: '#f3f5ef', borderRadius: 12 },
  // 参数帮助文字。
  note: { fontSize: 12, lineHeight: 19, color: '#65746c' },
  // 参数和画笔标签。
  label: { fontSize: 14, fontWeight: '600', color: '#385344' },
  // 色号搜索输入框。
  search: { minHeight: 46, borderWidth: 1, borderColor: '#cbd8ce', borderRadius: 10, paddingHorizontal: 12, color: '#18392d' },
  // 色板筛选限制高度，保留页面操作空间。
  colorScroller: { maxHeight: 240 },
  // 色块与色号按钮横向组合。
  colorOption: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  // 色块描边确保白色可见。
  swatch: { width: 20, height: 20, borderRadius: 5, borderWidth: 1, borderColor: '#aab7ac' },
});
