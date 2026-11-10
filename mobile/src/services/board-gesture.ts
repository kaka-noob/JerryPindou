// 纯几何计算同时供 UI 线程和回归测试使用。
export type BoardTransform = { x: number; y: number; scale: number };
export type BoardTouch = { id: number; x: number; y: number };
export type TouchPair = { first: number; second: number; x: number; y: number; distance: number };

export function touchPair(touches: BoardTouch[], previous: TouchPair | null): TouchPair | null {
  'worklet';
  if (touches.length < 2) return null;
  const first = touches.find(touch => touch.id === previous?.first) || touches[0];
  const second = touches.find(touch => touch.id === previous?.second && touch.id !== first.id)
    || touches.find(touch => touch.id !== first.id)!;
  return { first: first.id, second: second.id, x: (first.x + second.x) / 2, y: (first.y + second.y) / 2,
    distance: Math.hypot(first.x - second.x, first.y - second.y) };
}

export function moveBoard(view: BoardTransform, previous: TouchPair, next: TouchPair, minimum: number, maximum: number): BoardTransform {
  'worklet';
  // 换指只重建基准，避免中心和间距突变；每帧重建基准也避免达到缩放上限后反向拖动卡住。
  if (previous.first !== next.first || previous.second !== next.second || previous.distance < 1 || next.distance < 1) return view;
  const scale = Math.max(minimum, Math.min(maximum, view.scale * next.distance / previous.distance));
  const ratio = scale / view.scale;
  return { scale, x: next.x - (previous.x - view.x) * ratio, y: next.y - (previous.y - view.y) * ratio };
}

export function remainingTouches(touches: BoardTouch[], lifted: BoardTouch[]): BoardTouch[] {
  'worklet';
  return touches.filter(touch => !lifted.some(item => item.id === touch.id));
}
