// 生成结果仅展示预览和保存；二次创作复制图纸到独立创作草稿。
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Checkbox, Host } from '@expo/ui';
import { Canvas, Path } from '@shopify/react-native-skia';
import { calculateUsage } from '@/lib/utils/usage-calculator';
import { Page, ui } from '../components/page';
import { PatternBoard } from '../components/pattern-board';
import { getPalette, type Settings } from '../services/pattern';
import { saveImage } from '../services/export';
import { useStudio, type Draft } from '../state/studio';
import { showSuccess } from '../services/feedback';

// 展示原始图纸、用量和导出选项，同时生成镜像只影响保存图片。
export function Result({ draft }: { draft: Draft }) {
  const studio = useStudio();
  const [expanded, setExpanded] = useState(false);
  const [grid, setGrid] = useState(true);
  const [codes, setCodes] = useState(true);
  const [mirror, setMirror] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const palette = getPalette(draft.pattern.metadata.brand as Settings['brand']);
  const usage = calculateUsage(draft.pattern, palette, 'code');
  const total = usage.reduce((sum, item) => sum + item.count, 0);
  // 相册保存完成后再显示成功提示，失败保留当前图纸与选项。
  async function save() {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const filenames = await saveImage(draft.pattern, palette, { grid, codes, mirror });
      setMessage(`已保存到相册：${filenames.join('、')}`);
      showSuccess(mirror ? '原图和镜像图已保存' : '保存成功');
    } catch (error) { setError(error instanceof Error ? error.message : '保存失败，请重试。'); }
    finally { setBusy(false); }
  }
  // 复制为独立创作草稿，避免覆盖原图纸的编辑进度。
  function create() {
    const open = () => {
      studio.updateDraft('creation', () => ({
        pattern: { ...draft.pattern, metadata: { ...draft.pattern.metadata, createdAt: new Date().toISOString() },
          cells: draft.pattern.cells.map(row => row.map(cell => ({ ...cell }))) },
        completed: [], elapsed: 0, edited: false,
      }));
      router.push({ pathname: '/workbench', params: { kind: 'creation' } });
    };
    if (studio.drafts.creation?.edited) Alert.alert('进入二次创作？', '将用这张图纸替换当前自由创作草稿，请先保存需要保留的作品。', [
      { text: '取消', style: 'cancel' }, { text: '继续创作', onPress: open },
    ]); else open();
  }
  return <Page title="生成效果" footer={<View style={styles.actions}>
    <Pressable accessibilityRole="button" disabled={busy} onPress={create} style={[styles.button, styles.secondary]}><Text style={styles.secondaryText}>二次创作</Text></Pressable>
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void save()} style={[styles.button, styles.primary, busy && { opacity: 0.55 }]}><Text style={styles.primaryText}>{busy ? '正在保存…' : '保存到相册'}</Text></Pressable>
  </View>}>
    <View style={styles.preview}><PatternBoard pattern={draft.pattern} palette={palette} grid={grid} codes={codes} coordinates showInfo={false} /></View>
    <Text style={styles.hint}>双指缩放可调节图纸大小 · 双指拖动图纸</Text>
    <Text style={styles.stats}>✦ 尺寸:{draft.pattern.metadata.width}×{draft.pattern.metadata.height}  |  颜色:{usage.length}  |  豆数:{total}</Text>
    <View style={styles.colors}>
      <Text style={styles.heading}>◉ 使用颜色</Text>
      <View style={styles.colorGrid}>{(expanded ? usage : usage.slice(0, 10)).map(item => {
        const light = item.color.rgb[0] * 0.299 + item.color.rgb[1] * 0.587 + item.color.rgb[2] * 0.114 > 145;
        return <View key={item.colorId} style={[styles.colorItem, { backgroundColor: item.color.hex }]}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.colorText, { color: light ? '#17241c' : '#ffffff' }]}>{item.color.code}<Text style={[styles.colorCount, { color: light ? '#536057' : '#e0e8e3' }]}>×{item.count}</Text></Text>
        </View>;
      })}</View>
      {usage.length > 10 && <Pressable accessibilityRole="button" accessibilityLabel={expanded ? '收起使用颜色' : '展开全部使用颜色'} accessibilityState={{ expanded }} hitSlop={8}
        onPress={() => setExpanded(value => !value)} style={styles.expand}>
        <Canvas pointerEvents="none" style={styles.expandIcon}><Path path={expanded ? 'M 2 9 L 12 2 L 22 9' : 'M 2 2 L 12 9 L 22 2'} color="#896b7a" style="stroke" strokeWidth={2} strokeCap="round" strokeJoin="round" /></Canvas>
      </Pressable>}
    </View>
    <View style={styles.toggles}>
      <Toggle title="展示网格" checked={grid} disabled={busy} onChange={setGrid} />
      <Toggle title="展示色号" checked={codes} disabled={busy} onChange={setCodes} />
      <Toggle title="同时生成镜像" checked={mirror} disabled={busy} onChange={setMirror} />
    </View>
    {error ? <Text accessibilityRole="alert" style={ui.error}>{error}</Text> : null}
    {message ? <Text accessibilityLiveRegion="polite" style={ui.note}>{message}</Text> : null}
  </Page>;
}

// 使用原生复选框并允许窄屏换行，保存期间锁定导出选项。
function Toggle({ title, checked, disabled, onChange }: { title: string; checked: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  return <Host matchContents seedColor="#df4b89" colorScheme="light" style={styles.toggle}>
    <Checkbox value={checked} label={title} disabled={disabled} onValueChange={onChange} />
  </Host>;
}
const styles = StyleSheet.create({
  // 图纸上方保留紧凑留白。
  preview: { paddingTop: 12 },
  // 手势说明保持居中。
  hint: { textAlign: 'center', color: '#896b7a', fontSize: 13, paddingVertical: 4 },
  // 尺寸、颜色与颗数信息保持清晰可读。
  stats: { color: '#614555', fontSize: 14, lineHeight: 24 },
  // 用色卡片去掉分割线并扩大色表区域。
  colors: { backgroundColor: '#ffffff', borderRadius: 20, padding: 12, gap: 8 },
  // 卡片标题沿用主题文字。
  heading: { color: '#614555', fontSize: 16, fontWeight: '700', padding: 3 },
  // 色卡按四列排列并自动换行，色块本身填充对应拼豆颜色。
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: '1.3%', rowGap: 8 },
  // 每张色卡有更大的可视面积，适配窄屏与多行色表。
  colorItem: { width: '24%', minHeight: 40, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 6, justifyContent: 'center' },
  // 色号使用高对比度文字并占满色卡宽度。
  colorText: { fontSize: 12, fontWeight: '600' },
  // 数量用较浅文字淡化显示。
  colorCount: { fontWeight: '400' },
  // 展开按钮使用扁长外形，扩大触摸范围而不增加可见留白。
  expand: { alignSelf: 'center', width: 56, height: 22, borderRadius: 7, borderWidth: 1, borderColor: '#eddfe7', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  // 矢量折线图标宽大于高，不使用字体字符替代图标。
  expandIcon: { width: 24, height: 12 },
  // 三个导出选项随屏幕宽度自动换行。
  toggles: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  // 原生选项分配可用空间，保留最小触摸尺寸。
  toggle: { flexGrow: 1, flexBasis: 110, minHeight: 48 },
  // 底部操作横向共享可用宽度。
  actions: { flexDirection: 'row', gap: 16 },
  // 主次按钮维持相同触摸面积。
  button: { flex: 1, minHeight: 50, paddingVertical: 13, paddingHorizontal: 10, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  // 保存按钮使用主题强调色。
  primary: { backgroundColor: '#df4b89' },
  // 二次创作按钮使用浅色背景。
  secondary: { backgroundColor: '#f3e5ee' },
  // 主按钮文字采用白色增强对比。
  primaryText: { color: '#ffffff', fontSize: 17, fontWeight: '600' },
  // 次按钮文字使用主题深色。
  secondaryText: { color: '#614555', fontSize: 17 },
});
