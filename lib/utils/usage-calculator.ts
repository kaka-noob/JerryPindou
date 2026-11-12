// 本文件统计图纸用色，支持按用量或参考图的色号文本顺序排列。
import type { BeadPattern, BeadUsageItem, CompiledBeadColor } from '@/lib/types/bead';

// 统计非空格子；默认保留工作台按用量排序，图纸展示可指定色号顺序。
export function calculateUsage(pattern: BeadPattern, palette: CompiledBeadColor[], order: 'count' | 'code' = 'count'): BeadUsageItem[] {
  const counts = new Map<string, number>();
  for (const row of pattern.cells) {
    for (const cell of row) {
      if (cell.isEmpty) continue;
      counts.set(cell.colorId, (counts.get(cell.colorId) || 0) + 1);
    }
  }

  const colorMap = new Map(palette.map(c => [c.id, c]));
  const items: BeadUsageItem[] = [];
  for (const [colorId, count] of counts) {
    const color = colorMap.get(colorId);
    if (color) items.push({ colorId, color, count });
  }

  return items.sort((a, b) => order === 'code'
    ? a.color.code.localeCompare(b.color.code, 'en', { numeric: false }) : b.count - a.count);
}

// 汇总实际需要的拼豆颗数。
export function totalBeads(usage: BeadUsageItem[]): number {
  return usage.reduce((sum, item) => sum + item.count, 0);
}

// 将用色统计转换成逗号分隔的文本。
export function usageToCsv(usage: BeadUsageItem[]): string {
  const header = 'Code,Name,Hex,Count';
  const rows = usage.map(u => `${u.color.code},${u.color.name},${u.color.hex},${u.count}`);
  return [header, ...rows].join('\n');
}
