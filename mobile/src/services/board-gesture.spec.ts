import { describe, expect, it } from 'vitest';
import { moveBoard, remainingTouches, touchPair } from './board-gesture';

describe('图纸双指手势', () => {
  const initial = { x: 20, y: 30, scale: 1 };
  const pair = touchPair([{ id: 1, x: 50, y: 100 }, { id: 2, x: 150, y: 100 }], null)!;
  it('沿圆弧转动两指时不产生缩放或位置跳动', () => {
    const rotated = touchPair([{ id: 1, x: 100, y: 50 }, { id: 2, x: 100, y: 150 }], pair)!;
    expect(moveBoard(initial, pair, rotated, 0.1, 3)).toEqual(initial);
  });
  it('放大时始终保持双指中心对应的格子不动，同时跟随中心移动', () => {
    const next = { ...pair, x: 130, y: 140, distance: 200 };
    const result = moveBoard(initial, pair, next, 0.1, 3);
    expect(result.scale).toBe(2);
    expect((next.x - result.x) / result.scale).toBe((pair.x - initial.x) / initial.scale);
    expect((next.y - result.y) / result.scale).toBe((pair.y - initial.y) / initial.scale);
  });
  it('手指越过预览边缘仍可连续移动，不强制居中', () => {
    const outside = { ...pair, x: -250, y: 650 };
    expect(moveBoard(initial, pair, outside, 0.1, 3)).toEqual({ x: -330, y: 580, scale: 1 });
  });
  it('原生触摸数组重排或第三指落下不会改变所跟踪的两指', () => {
    const reordered = touchPair([{ id: 3, x: 800, y: 800 }, { id: 2, x: 150, y: 100 }, { id: 1, x: 50, y: 100 }], pair);
    expect(reordered).toEqual(pair);
  });
  it('换指重新建立基准而不跳动', () => {
    const replacement = touchPair([{ id: 1, x: 50, y: 100 }, { id: 3, x: 700, y: 900 }], pair)!;
    expect(moveBoard(initial, pair, replacement, 0.1, 3)).toEqual(initial);
    const moved = moveBoard(initial, replacement, { ...replacement, x: replacement.x + 5 }, 0.1, 3);
    expect(moved.x).toBe(25);
  });
  it('到达缩放上限后反向收缩立即响应', () => {
    const limited = moveBoard(initial, pair, { ...pair, distance: 1000 }, 0.1, 3);
    expect(limited.scale).toBe(3);
    const reversed = moveBoard(limited, { ...pair, distance: 1000 }, { ...pair, distance: 900 }, 0.1, 3);
    expect(reversed.scale).toBeCloseTo(2.7);
  });
  it('抬指事件包含离开的指针时，正确识别剩余一指和全部离开', () => {
    const touches = [{ id: 1, x: 20, y: 30 }, { id: 2, x: 40, y: 50 }];
    const remaining = remainingTouches(touches, [touches[1]]);
    expect(remaining).toEqual([touches[0]]);
    expect(touchPair(remaining, pair)).toBeNull();
    expect(remainingTouches(remaining, [touches[0]])).toEqual([]);
  });
});
