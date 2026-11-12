// 两条工作流分别保存草稿，路由切换共享内存；旧版单草稿只迁移到图片工作台。
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type Dispatch, type SetStateAction } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BeadPattern } from '@/lib/types/bead';
import { validateProject } from '../services/export';
import { blankPattern, initialSettings } from '../services/editor';
import type { Settings, WorkMode } from '../services/pattern';

export type DraftKind = 'conversion' | 'creation';
export type SourceImage = { uri: string; width: number; height: number };
export interface Draft { pattern: BeadPattern; completed: string[]; elapsed: number; edited: boolean }
export interface Conversion { settings: Settings; source: SourceImage | null; mode: WorkMode }
type Studio = { ready: boolean; error: string; drafts: Record<DraftKind, Draft | null>;
  conversion: Conversion; setConversion: Dispatch<SetStateAction<Conversion>>;
  pendingImage: SourceImage | null; setPendingImage: Dispatch<SetStateAction<SourceImage | null>>;
  updateDraft: (kind: DraftKind, update: (draft: Draft | null) => Draft) => void };
const Context = createContext<Studio | null>(null);
const KEY = 'pindo-studio-v2';
export function StudioProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<Record<DraftKind, Draft | null>>({ conversion: null, creation: null });
  const [conversion, setConversion] = useState<Conversion>({ settings: initialSettings(), source: null, mode: 'generate' });
  const [pendingImage, setPendingImage] = useState<SourceImage | null>(null);
  const latest = useRef('');
  const writable = useRef(true);
  const writes = useRef(Promise.resolve());
  const save = () => {
    if (!latest.current) return;
    const snapshot = latest.current;
    writes.current = writes.current.then(() => AsyncStorage.setItem(KEY, snapshot)).catch(() => setError('草稿保存失败，请导出工程备份后重试。'));
  };
  useEffect(() => {
    let active = true;
    let original = '';
    void (async () => {
      const raw = await AsyncStorage.getItem(KEY);
      original = raw || '';
      if (!active) return;
      if (raw) {
        const saved = JSON.parse(raw);
        const restored: Record<DraftKind, Draft | null> = { conversion: null, creation: null };
        for (const kind of ['conversion', 'creation'] as const) {
          if (saved.drafts?.[kind]) restored[kind] = { ...validateProject(saved.drafts[kind]), edited: !!saved.drafts[kind].edited };
        }
        setDrafts(restored);
        if (saved.conversion?.settings) setConversion({ settings: { ...initialSettings(), ...saved.conversion.settings },
          source: saved.conversion.source || null, mode: saved.conversion.mode || 'generate' });
      } else {
        const old = await AsyncStorage.getItem('pindo-native-workspace-v1');
        if (active && old) setDrafts({ conversion: { ...validateProject(JSON.parse(old)), edited: true }, creation: null });
      }
    })().catch(async () => {
      if (!active) return;
      // 损坏数据先备份；若连备份也失败则禁止覆盖原存储。
      try {
        if (original) await AsyncStorage.setItem(`pindo-studio-recovery-${Date.now()}`, original);
        setError('旧草稿读取失败，原始数据已保留在本机恢复备份中；可导入已导出的工程继续。');
      } catch {
        writable.current = false;
        setError('草稿读取和备份失败，已暂停自动保存以保护原始数据。请导出工程备份。');
      }
    })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!ready || !writable.current) return;
    latest.current = JSON.stringify({ drafts, conversion });
    const timer = setTimeout(save, 500);
    return () => clearTimeout(timer);
  }, [drafts, conversion, ready]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => { if (state !== 'active') save(); });
    return () => listener.remove();
  }, []);
  const updateDraft = useCallback((kind: DraftKind, update: (draft: Draft | null) => Draft) => {
    setDrafts(previous => ({ ...previous, [kind]: update(previous[kind]) }));
  }, []);
  return <Context.Provider value={{ ready, error, drafts, conversion, setConversion, pendingImage, setPendingImage, updateDraft }}>{children}</Context.Provider>;
}
export function useStudio() { const studio = useContext(Context); if (!studio) throw new Error('未初始化工作台'); return studio; }
export function emptyDraft(): Draft { return { pattern: blankPattern(), completed: [], elapsed: 0, edited: false }; }
