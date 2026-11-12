// 本文件验证原生生成流程的透明留空、色板筛选和输入像素保护。
import { describe, expect, it, vi } from 'vitest';
import { createPattern, createPatternAsync, DEFAULT_SETTINGS, getPalette } from './pattern';
import { calculateUsage } from '@/lib/utils/usage-calculator';
import * as matcher from '@/lib/engine/color-matcher';

describe('原生图纸生成流程', () => {
  it('分片生成与同步生成一致，亮度参数影响最终色号', async () => {
    const source = { width: 2, height: 1, data: new Uint8ClampedArray([60, 60, 60, 255, 80, 80, 80, 255]) };
    const settings = { ...DEFAULT_SETTINGS, width: 2, height: 1, brightness: 80 };
    const asynchronous = await createPatternAsync(source, settings, 'generate', () => false);
    const synchronous = createPattern(source, settings, 'generate');
    expect(asynchronous.pattern.cells).toEqual(synchronous.pattern.cells);
    expect(asynchronous.pattern.cells).not.toEqual(createPattern(source, { ...settings, brightness: 0 }, 'generate').pattern.cells);
  });
  it('取消旧参数时停止计算，不提交部分结果', async () => {
    const source = { width: 1, height: 1, data: new Uint8ClampedArray([60, 60, 60, 255]) };
    let checks = 0;
    await expect(createPatternAsync(source, DEFAULT_SETTINGS, 'generate', () => ++checks > 2)).rejects.toThrow('预览已更新');
  });
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

  it('大面积透明背景不会挤掉唯一的主体颜色', () => {
    const settings = { ...DEFAULT_SETTINGS, width: 4, height: 1, maxColors: 1, background: 'transparent' as const };
    const source = { width: 4, height: 1, data: new Uint8ClampedArray([220, 30, 50, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) };
    const expected = createPattern({ width: 1, height: 1, data: source.data.slice(0, 4) }, { ...settings, width: 1 }, 'generate');
    const result = createPattern(source, settings, 'generate');
    expect(result.pattern.cells[0][0].colorId).toBe(expected.pattern.cells[0][0].colorId);
    expect(calculateUsage(result.pattern, result.palette).map(item => item.count)).toEqual([1]);
  });

  it('全透明图片在所有抖动方式下都生成空图而不崩溃', () => {
    for (const dithering of ['none', 'ordered', 'floyd-steinberg'] as const) {
      const result = createPattern({ width: 2, height: 1, data: new Uint8ClampedArray(8) }, {
        ...DEFAULT_SETTINGS, width: 2, height: 1, background: 'transparent', dithering,
      }, 'generate');
      expect(result.pattern.cells[0].every(cell => cell.isEmpty)).toBe(true);
      expect(calculateUsage(result.pattern, result.palette)).toEqual([]);
    }
  });

  it('透明格子的占位色不会污染后续相同像素的颜色匹配', () => {
    const result = createPattern({ width: 2, height: 1, data: new Uint8ClampedArray([0, 0, 0, 0, 255, 255, 255, 255]) }, {
      ...DEFAULT_SETTINGS, width: 2, height: 1, background: 'transparent',
    }, 'generate');
    const expected = matcher.matchColor({ r: 255, g: 255, b: 255 }, getPalette('mard'));
    expect(result.pattern.cells[0][1].colorId).toBe(expected.id);
  });

  it('无抖动且色数无需削减时不再重复执行颜色匹配', () => {
    const matching = vi.spyOn(matcher, 'matchColor');
    try {
      createPattern({ width: 2, height: 1, data: new Uint8ClampedArray([60, 60, 60, 255, 60, 60, 60, 255]) }, {
        ...DEFAULT_SETTINGS, width: 2, height: 1,
      }, 'generate');
      expect(matching).toHaveBeenCalledTimes(1);
    } finally { matching.mockRestore(); }
  });
});
