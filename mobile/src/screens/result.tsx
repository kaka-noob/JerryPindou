// 生成结果仅展示预览和保存；二次创作复制图纸到独立创作草稿。
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { calculateUsage } from '@/lib/utils/usage-calculator';
import { Page, ui } from '../components/page';
import { PatternBoard } from '../components/pattern-board';
import { getPalette, type Settings } from '../services/pattern';
import { saveImage } from '../services/export';
import { useStudio, type Draft } from '../state/studio';

export function Result({ draft }: { draft: Draft }) {
  const studio = useStudio();
  const [expanded, setExpanded] = useState(false);
  const [grid, setGrid] = useState(true);
  const [codes, setCodes] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const palette = getPalette(draft.pattern.metadata.brand as Settings['brand']);
  const usage = calculateUsage(draft.pattern, palette);
  const total = usage.reduce((sum, item) => sum + item.count, 0);
  async function save() {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const filename = await saveImage(draft.pattern, palette, { grid, codes });
      setMessage(`已保存到相册：${filename}`);
    } catch (error) { setError(error instanceof Error ? error.message : '保存失败，请重试。'); }
    finally { setBusy(false); }
  }
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
    <View style={styles.preview}><PatternBoard pattern={draft.pattern} palette={palette} grid={grid} codes={codes} showInfo={false} /></View>
    <Text style={styles.hint}>双指缩放可调节图纸大小 · 双指拖动图纸</Text>
    <Text style={styles.stats}>✦ 尺寸:{draft.pattern.metadata.width}×{draft.pattern.metadata.height}  |  颜色:{usage.length}  |  豆数:{total}</Text>
    <View style={styles.colors}>
      <Text style={styles.heading}>◉ 使用颜色</Text>
      <View style={styles.divider} />
      <View style={styles.colorGrid}>{(expanded ? usage : usage.slice(0, 10)).map(item => <View key={item.colorId} style={styles.colorItem}>
        <View style={[styles.chip, { backgroundColor: item.color.hex }]} /><Text numberOfLines={1} adjustsFontSizeToFit style={styles.colorText}>{item.color.code}×{item.count}</Text>
      </View>)}</View>
      {usage.length > 10 && <Pressable accessibilityRole="button" accessibilityLabel={expanded ? '收起使用颜色' : '展开全部使用颜色'} accessibilityState={{ expanded }} hitSlop={8}
        onPress={() => setExpanded(value => !value)} style={styles.expand}><Text style={styles.expandText}>{expanded ? '⌃' : '⌄'}</Text></Pressable>}
    </View>
    <View style={styles.toggles}>
      <Toggle title="展示网格" checked={grid} onPress={() => setGrid(value => !value)} />
      <Toggle title="展示色号" checked={codes} onPress={() => setCodes(value => !value)} />
    </View>
    {error ? <Text accessibilityRole="alert" style={ui.error}>{error}</Text> : null}
    {message ? <Text accessibilityLiveRegion="polite" style={ui.note}>{message}</Text> : null}
  </Page>;
}

function Toggle({ title, checked, onPress }: { title: string; checked: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onPress} style={styles.toggle}>
    <View style={[styles.radio, checked && styles.radioChecked]}>{checked && <View style={styles.dot} />}</View><Text style={styles.toggleText}>{title}</Text>
  </Pressable>;
}
const styles = StyleSheet.create({
  preview: { paddingTop: 12 },
  hint: { textAlign: 'center', color: '#896b7a', fontSize: 13, paddingVertical: 4 },
  stats: { color: '#614555', fontSize: 14, lineHeight: 24 },
  colors: { backgroundColor: '#ffffff', borderRadius: 20, padding: 12, gap: 14 },
  heading: { color: '#614555', fontSize: 16, fontWeight: '700', padding: 3 },
  divider: { height: 1, backgroundColor: '#f6eef2' },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: '2%', rowGap: 8 },
  colorItem: { width: '18.4%', flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderColor: '#f1e7ed', borderRadius: 4, padding: 3, minHeight: 26 },
  chip: { width: 12, height: 16, borderRadius: 2 },
  colorText: { flex: 1, color: '#614555', fontSize: 10 },
  expand: { alignSelf: 'center', minWidth: 48, minHeight: 30, alignItems: 'center', justifyContent: 'center' },
  expandText: { color: '#896b7a', fontSize: 24, lineHeight: 28 },
  toggles: { flexDirection: 'row', gap: 28, flexWrap: 'wrap' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  toggleText: { color: '#614555', fontSize: 15 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: '#c4a5b6', alignItems: 'center', justifyContent: 'center' },
  radioChecked: { borderColor: '#df4b89' },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#df4b89' },
  actions: { flexDirection: 'row', gap: 16 },
  button: { flex: 1, minHeight: 50, paddingVertical: 13, paddingHorizontal: 10, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: '#df4b89' },
  secondary: { backgroundColor: '#f3e5ee' },
  primaryText: { color: '#ffffff', fontSize: 17, fontWeight: '600' },
  secondaryText: { color: '#614555', fontSize: 17 },
});
