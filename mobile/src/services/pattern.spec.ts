// 本文件验证原生生成流程的透明留空、色板筛选和输入像素保护。
import { describe, expect, it } from 'vitest';
import { createPattern, DEFAULT_SETTINGS, getPalette } from './pattern';
import { calculateUsage } from '@/lib/utils/usage-calculator';

describe('原生图纸生成流程', () => {
  it('将透明区域留空且用量不计算空格，不修改原图片像素', () => {
    const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0]);
    const original = data.slice();
    const result = createPattern({ width: 2, height: 1, data }, { ...DEFAULT_SETTINGS, width: 2, height: 1, background: 'transparent', creative: 'rough' }, 'generate');
    expect(result.pattern.cells[0][1].isEmpty).toBe(true);
    expect(calculateUsage(result.pattern, result.palette).reduce((sum, item) => sum + item.count, 0)).toBe(1);
    expect(data).toEqual(original);
  });

  it('生成结果不会包含已排除的色号', () => {
    const palette = getPalette('mard');
    const keep = palette[0];
    const result = createPattern({ width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 0, 255]) }, {
      ...DEFAULT_SETTINGS, width: 1, height: 1, excluded: palette.slice(1).map(color => color.id),
    }, 'generate');
    expect(result.pattern.cells[0][0].colorId).toBe(keep.id);
  });

  it('全部颜色排除时给出可恢复的错误', () => {
    expect(() => createPattern({ width: 1, height: 1, data: new Uint8ClampedArray(4) }, {
      ...DEFAULT_SETTINGS, excluded: getPalette('mard').map(color => color.id),
    }, 'generate')).toThrow('至少保留一种');
  });
});
