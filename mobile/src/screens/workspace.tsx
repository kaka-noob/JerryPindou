// 独立图纸工作台：图片和自由创作草稿隔离，编辑历史按笔画保存。
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, AppState, BackHandler, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import type { BeadPattern } from '@/lib/types/bead';
import { calculateUsage } from '@/lib/utils/usage-calculator';
import { Action, Choices, NumberField, Section } from '../components/controls';
import { Page, ui } from '../components/page';
import { PatternBoard } from '../components/pattern-board';
import { BRANDS, getPalette, type Settings } from '../services/pattern';
import { blankPattern, paintCell, replaceColor } from '../services/editor';
import { importProject, saveImage, shareImage, sharePdf, shareProject, shareUsage } from '../services/export';
import { useStudio, type Draft } from '../state/studio';
import { Result } from './result';

export function Workspace() {
  const params = useLocalSearchParams<{ kind?: string; import?: string }>();
  const kind = params.kind === 'creation' ? 'creation' : 'conversion';
  const studio = useStudio();
  const draft = studio.drafts[kind];
  const current = useRef(draft);
  useLayoutEffect(() => { current.current = draft; }, [draft]);
  const [tool, setTool] = useState<'view' | 'paint' | 'erase'>(kind === 'creation' ? 'paint' : 'view');
  const [paint, setPaint] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [focus, setFocus] = useState(false);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<{ undo: BeadPattern[]; redo: BeadPattern[] }>({ undo: [], redo: [] });
  const stroke = useRef<BeadPattern | null>(null);
  const [newBrand, setNewBrand] = useState<Settings['brand']>('mard');
  const [newWidth, setNewWidth] = useState(29);
  const [newHeight, setNewHeight] = useState(29);
  const [newForm, setNewForm] = useState(false);
  const palette = draft ? getPalette(draft.pattern.metadata.brand as Settings['brand']) : [];
  const paintId = palette.some(color => color.id === paint) ? paint : palette[0]?.id || '';
  const usage = draft ? calculateUsage(draft.pattern, palette) : [];
  const total = usage.reduce((sum, item) => sum + item.count, 0);
  const createdAt = draft?.pattern.metadata.createdAt;
  const identity = `${kind}:${createdAt}`;
  const [previousIdentity, setPreviousIdentity] = useState(identity);
  if (identity !== previousIdentity) { setPreviousIdentity(identity); setHistory({ undo: [], redo: [] }); setSelected([]); }
  const hasDraft = !!draft;
  const { updateDraft } = studio;
  useEffect(() => {
    if (!focus || !running || !hasDraft) return;
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') updateDraft(kind, previous => ({ ...previous!, elapsed: previous!.elapsed + 1 }));
    }, 1000);
    return () => clearInterval(timer);
  }, [focus, running, hasDraft, kind, updateDraft]);
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!focus) return false;
      setFocus(false); setRunning(false); return true;
    });
    return () => listener.remove();
  }, [focus]);
  function put(next: Draft) { current.current = next; studio.updateDraft(kind, () => next); }
  function commit(pattern: BeadPattern, record = true) {
    const before = current.current;
    if (!before || before.pattern === pattern) return;
    if (record) setHistory(previous => ({ undo: [...previous.undo.slice(-29), before.pattern], redo: [] }));
    put({ ...before, pattern, edited: true,
      completed: before.completed.filter(key => { const [row, col] = key.split(',').map(Number);
        return !pattern.cells[row][col].isEmpty && pattern.cells[row][col].colorId === before.pattern.cells[row][col].colorId; }) });
  }
  function startStroke() { stroke.current = current.current?.pattern || null; }
  function endStroke() {
    const before = stroke.current; stroke.current = null;
    if (before && before !== current.current?.pattern) setHistory(previous => ({ undo: [...previous.undo.slice(-29), before], redo: [] }));
  }
  function cell(row: number, col: number) {
    const before = current.current;
    if (!before || busy) return;
    const item = before.pattern.cells[row][col];
    if (focus) {
      if (item.isEmpty || (selected.length && !selected.includes(item.colorId))) return;
      const key = `${row},${col}`;
      put({ ...before, completed: before.completed.includes(key) ? before.completed.filter(value => value !== key) : [...before.completed, key] });
    } else if (kind === 'creation' && tool !== 'view') commit(paintCell(before.pattern, row, col, paintId, tool === 'erase'), !stroke.current);
    else if (!item.isEmpty) { setSelected([item.colorId]); setMessage(`第 ${row + 1} 行，第 ${col + 1} 列 · ${palette.find(color => color.id === item.colorId)?.code}`); }
  }
  async function perform(task: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError('');
    try { await task(); } catch (error) { setError(error instanceof Error ? error.message : '操作失败，请重试'); }
    finally { setBusy(false); }
  }
  async function load() {
    await perform(async () => {
      const result = await importProject();
      if (!result) return;
      const apply = () => { put({ ...result, edited: true }); setHistory({ undo: [], redo: [] }); setSelected([]); setMessage('工程已导入并自动保存。'); };
      if (current.current) Alert.alert('替换当前草稿？', '导入工程会替换本入口的草稿，另一入口的作品不会受影响。', [
        { text: '取消', style: 'cancel' }, { text: '导入并替换', style: 'destructive', onPress: apply },
      ]); else apply();
    });
  }
  const imported = useRef(false);
  useEffect(() => {
    if (studio.ready && params.import === 'yes' && !imported.current) { imported.current = true; void load(); }
    // 仅响应首次进入的导入入口，后续状态变化不重复打开文件选择器。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studio.ready, params.import]);
  function clear() {
    if (!draft) return;
    Alert.alert('清空画布？', '清空所有格子及拼豆进度，保留当前尺寸和品牌。可以撤销格子清空。', [
      { text: '取消', style: 'cancel' }, { text: '清空', style: 'destructive', onPress: () => {
        const before = current.current!;
        commit({ ...blankPattern(before.pattern.metadata.brand as Settings['brand'], before.pattern.metadata.width, before.pattern.metadata.height),
          metadata: { ...before.pattern.metadata, background: 'transparent' } });
        studio.updateDraft(kind, previous => ({ ...previous!, completed: [], elapsed: 0 }));
      } },
    ]);
  }
  function newCanvas() {
    Alert.alert('新建画布？', '这会覆盖自由创作草稿，请先导出需要保留的作品。', [
      { text: '取消', style: 'cancel' }, { text: '新建', style: 'destructive', onPress: () => {
        put({ pattern: blankPattern(newBrand, newWidth, newHeight), completed: [], elapsed: 0, edited: false }); setNewForm(false);
      } },
    ]);
  }
  const elapsed = draft?.elapsed || 0;
  const time = `${Math.floor(elapsed / 3600).toString().padStart(2, '0')}:${Math.floor(elapsed / 60 % 60).toString().padStart(2, '0')}:${Math.floor(elapsed % 60).toString().padStart(2, '0')}`;
  if (kind === 'conversion' && draft) return <Result draft={draft} />;
  return <Page title={focus ? '专注拼豆' : kind === 'creation' ? '自由创作画布' : '图纸工作台'}>
    {error ? <Text accessibilityRole="alert" style={ui.error}>{error}</Text> : null}
    {message ? <Text style={ui.note}>{message}</Text> : null}
    {!draft ? <Section title="继续你的作品"><Text style={ui.note}>可以导入工程，或返回首页选择图片。</Text><Action title="导入工程" disabled={busy} onPress={() => void load()} /></Section> : <>
      {focus ? <Section title={`${time} · ${draft.completed.length}/${total} 颗完成`}>
        <View style={ui.row}><Action title={running ? '暂停计时' : '继续计时'} active={running} onPress={() => setRunning(value => !value)} />
          <Action title="返回工作台" onPress={() => { setFocus(false); setRunning(false); }} />
          <Action title="重置完成标记" onPress={() => Alert.alert('重置进度？', '完成标记和计时将被清除。', [{ text: '取消', style: 'cancel' },
            { text: '重置', style: 'destructive', onPress: () => put({ ...current.current!, completed: [], elapsed: 0 }) }])} /></View>
      </Section> : <>
        {kind === 'creation' && <View style={ui.row}>
          <Action title="专注拼豆" onPress={() => { setFocus(true); setRunning(true); setSelected([]); }} />
          <Action title="清空画布" onPress={clear} /><Action title="画布设置" onPress={() => setNewForm(value => !value)} />
        </View>}
        {newForm && <Section title="新建自由画布"><Choices items={BRANDS} value={newBrand} onChange={setNewBrand} /><View style={ui.row}>
          <NumberField title="宽度（颗）" value={newWidth} onChange={setNewWidth} /><NumberField title="高度（颗）" value={newHeight} onChange={setNewHeight} /></View><Action title="新建画布" onPress={newCanvas} /></Section>}
        {kind === 'creation' && <Section title="创作工具"><Choices items={[["view", "查看色号"], ["paint", "画笔"], ["erase", "橡皮擦"]]} value={tool} onChange={value => { setTool(value); setSelected([]); }} />
          <View style={ui.row}><Action title="撤销" disabled={!history.undo.length || busy} onPress={() => {
            const previous = history.undo.at(-1)!; const now = current.current!.pattern;
            commit(previous, false); setHistory(value => ({ undo: value.undo.slice(0, -1), redo: [...value.redo, now] }));
          }} /><Action title="重做" disabled={!history.redo.length || busy} onPress={() => {
            const next = history.redo.at(-1)!; const now = current.current!.pattern;
            commit(next, false); setHistory(value => ({ undo: [...value.undo, now], redo: value.redo.slice(0, -1) }));
          }} /></View>
          {tool !== 'view' && <><TextInput accessibilityLabel="查找画笔色号" value={search} onChangeText={setSearch} placeholder="查找色号或颜色名称" style={ui.input} />
            <Text style={ui.note}>画笔：{palette.find(color => color.id === paintId)?.code} · 从完整品牌色板选色</Text>
            <ScrollView horizontal><View style={{ flexDirection: 'row', gap: 8 }}>{palette.filter(color => `${color.code} ${color.name}`.toLowerCase().includes(search.toLowerCase())).map(color => <View key={color.id} style={ui.row}>
              <View style={[ui.swatch, { backgroundColor: color.hex }]} /><Action title={color.code} active={paintId === color.id} onPress={() => setPaint(color.id)} />
            </View>)}</View></ScrollView></>}
          <Action title="将所选色号批量替换为画笔颜色" disabled={!selected.length || busy} onPress={() => {
            Alert.alert('批量替色？', `将所选 ${selected.length} 种颜色替换为 ${palette.find(color => color.id === paintId)?.code}。`, [
              { text: '取消', style: 'cancel' }, { text: '替换', onPress: () => { commit(selected.reduce((pattern, id) => replaceColor(pattern, id, paintId), current.current!.pattern)); setSelected([]); } },
            ]);
          }} /><Text style={ui.note}>在下方用量表选择要替换的色号，再选择目标画笔颜色。</Text>
        </Section>}
      </>}
      <Section title={`${draft.pattern.metadata.width} × ${draft.pattern.metadata.height} 颗 · ${usage.length} 色 · ${total} 颗`}>
        <PatternBoard pattern={draft.pattern} palette={palette} selected={selected} completed={focus ? draft.completed : []}
          onCell={cell} drawing={kind === 'creation' && !focus && tool !== 'view'} onStrokeStart={startStroke} onStrokeEnd={endStroke} />
        {focus && <Text style={ui.note}>{total > 0 && draft.completed.length === total ? '全部拼好啦！' : '点击格子标记完成；选中色号后只操作该颜色。'}</Text>}
      </Section>
      <Section title="色号与用量"><Text style={ui.note}>需要 {Math.ceil(draft.pattern.metadata.width / 29) * Math.ceil(draft.pattern.metadata.height / 29)} 块 29 × 29 拼板。</Text>
        <Action title="取消颜色选择" onPress={() => setSelected([])} /><View style={ui.row}>{usage.map(item => <View key={item.colorId} style={ui.row}>
          <View style={[ui.swatch, { backgroundColor: item.color.hex }]} /><Action title={`${item.color.code} × ${item.count}`} active={selected.includes(item.colorId)} onPress={() => setSelected(previous => previous.includes(item.colorId) ? previous.filter(id => id !== item.colorId) : [...previous, item.colorId])} />
        </View>)}</View>
      </Section>
      {!focus && <Section title="保存与导出"><View style={ui.row}>
        <Action title="保存 PNG 到相册" disabled={busy} onPress={() => void perform(async () => { await saveImage(draft.pattern, palette); setMessage('图纸已保存到相册。'); })} />
        <Action title="分享 PNG" disabled={busy} onPress={() => void perform(() => shareImage(draft.pattern, palette))} />
        <Action title="导出 PDF" disabled={busy} onPress={() => void perform(() => sharePdf(draft.pattern, palette))} />
        <Action title="导出用量 CSV" disabled={busy} onPress={() => void perform(() => shareUsage(draft.pattern, palette))} />
        <Action title="导出工程" disabled={busy} onPress={() => void perform(() => shareProject(draft.pattern, draft.completed, draft.elapsed))} />
        <Action title="导入工程" disabled={busy} onPress={() => void load()} /></View><Text style={ui.note}>本入口的草稿自动保存在本机。导出工程可保留备份。</Text>
      </Section>}
    </>}
  </Page>;
}
