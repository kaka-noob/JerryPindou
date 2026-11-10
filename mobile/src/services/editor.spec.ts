import { describe, expect, it } from 'vitest';
import { blankPattern, fitSize, paintCell, replaceColor } from './editor';
import { getPalette } from './pattern';
import { calculateUsage } from '@/lib/utils/usage-calculator';

describe('自由创作与图片比例', () => {
  it('首次为 MARD 29×29 空白画布，可以绘制空格，橡皮擦后用量归零', () => {
    const blank = blankPattern();
    const palette = getPalette('mard');
    const painted = paintCell(blank, 12, 14, palette[1].id, false);
    expect(painted.cells[12][14]).toEqual({ colorId: palette[1].id, isEmpty: false });
    expect(calculateUsage(painted, palette)[0].count).toBe(1);
    expect(calculateUsage(paintCell(painted, 12, 14, palette[0].id, true), palette)).toEqual([]);
    expect(blank.cells[12][14].isEmpty).toBe(true);
  });
  it('批量替色只修改非空格，旧快照可用于撤销且两份作品互不影响', () => {
    const palette = getPalette('mard');
    const conversion = paintCell(blankPattern(), 0, 0, palette[0].id, false);
    const creation = paintCell(blankPattern(), 1, 1, palette[0].id, false);
    const next = replaceColor(creation, palette[0].id, palette[1].id);
    expect(next.cells[1][1].colorId).toBe(palette[1].id);
    expect(next.cells[0][0].isEmpty).toBe(true);
    expect(creation.cells[1][1].colorId).toBe(palette[0].id);
    expect(conversion.cells[0][0].colorId).toBe(palette[0].id);
  });
  it('清空保留品牌与尺寸，且每行格子独立', () => {
    const empty = blankPattern('hama', 40, 20);
    expect(empty.metadata).toMatchObject({ brand: 'hama', width: 40, height: 20 });
    const painted = paintCell(empty, 0, 0, getPalette('hama')[1].id, false);
    expect(painted.cells[1][0].isEmpty).toBe(true);
  });
  it('最长边遵循图片比例并限制在 1–200', () => {
    expect(fitSize(58, 1000, 500)).toEqual({ width: 58, height: 29 });
    expect(fitSize(58, 500, 1000)).toEqual({ width: 29, height: 58 });
    expect(fitSize(1000, 500, 1000)).toEqual({ width: 100, height: 200 });
  });
});
