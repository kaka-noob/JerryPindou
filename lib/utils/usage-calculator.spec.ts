// 本文件验证图纸色号采用参考图文本顺序，且不改变工作台原有的用量顺序。
import { describe, expect, it } from 'vitest';
import type { BeadPattern, CompiledBeadColor } from '@/lib/types/bead';
import { calculateUsage } from './usage-calculator';

describe('图纸颜色排序', () => {
  it('参考图的文本顺序为 H14、H15、H4，而默认统计仍按用量排列', () => {
    const palette = ['H4', 'H15', 'H14'].map(code => ({ id: code, code }) as CompiledBeadColor);
    const pattern = { cells: [[{ colorId: 'H4' }, { colorId: 'H4' }, { colorId: 'H15' }, { colorId: 'H14', isEmpty: true }, { colorId: 'H14' }]] } as BeadPattern;
    expect(calculateUsage(pattern, palette, 'code').map(item => item.color.code)).toEqual(['H14', 'H15', 'H4']);
    expect(calculateUsage(pattern, palette)[0]).toMatchObject({ colorId: 'H4', count: 2 });
    expect(calculateUsage(pattern, palette, 'code').reduce((sum, item) => sum + item.count, 0)).toBe(4);
  });
});
