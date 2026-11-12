// 纯数据编辑操作：空格可绘制，撤销恢复完整图纸，清空不改变品牌或尺寸。
import type { BeadPattern } from '@/lib/types/bead';
import { DEFAULT_SETTINGS, getPalette, validSize, type Settings } from './pattern';

export function blankPattern(brand: Settings['brand'] = 'mard', width = 29, height = 29): BeadPattern {
  return { version: 1, metadata: { brand, width: validSize(width), height: validSize(height),
    dithering: 'none', background: 'transparent', createdAt: new Date().toISOString() },
  cells: Array.from({ length: validSize(height) }, () => Array.from({ length: validSize(width) }, () => ({ colorId: getPalette(brand)[0].id, isEmpty: true }))) };
}

export function paintCell(pattern: BeadPattern, row: number, col: number, colorId: string, erase: boolean) {
  const old = pattern.cells[row]?.[col];
  if (!old || (erase ? old.isEmpty : !old.isEmpty && old.colorId === colorId)) return pattern;
  return { ...pattern, cells: pattern.cells.map((cells, r) => r !== row ? cells : cells.map((cell, c) => c !== col ? cell : { colorId: erase ? cell.colorId : colorId, isEmpty: erase })) };
}

export function replaceColor(pattern: BeadPattern, from: string, to: string) {
  if (from === to) return pattern;
  return { ...pattern, cells: pattern.cells.map(row => row.map(cell => !cell.isEmpty && cell.colorId === from ? { colorId: to } : cell)) };
}

export function fitSize(longest: number, width: number, height: number) {
  const size = validSize(longest);
  return width >= height ? { width: size, height: validSize(size * height / width) }
    : { width: validSize(size * width / height), height: size };
}

export const initialSettings = () => ({ ...DEFAULT_SETTINGS, excluded: [] });
