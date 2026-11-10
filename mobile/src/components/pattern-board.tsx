// 原生手势在 UI 线程更新 Skia，图纸以外的触摸由页面滚动处理。
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Canvas, Group, Picture, Skia } from '@shopify/react-native-skia';
import { GestureDetector, GestureStateManager, useManualGesture } from 'react-native-gesture-handler';
import { cancelAnimation, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { BeadPattern, CompiledBeadColor } from '@/lib/types/bead';
import { drawChart } from '../services/drawing';
import { moveBoard, remainingTouches, touchPair, type BoardTouch, type TouchPair } from '../services/board-gesture';
import { ScrollGestureContext } from './scroll-gesture';

const EMPTY_IDS: string[] = [];
type Session = { start: BoardTouch; moved: boolean; multi: boolean; stroke: boolean; pair: TouchPair | null };
export function PatternBoard({ pattern, palette, selected = EMPTY_IDS, completed = EMPTY_IDS, onCell, height: fixedHeight,
  drawing = false, onStrokeStart, onStrokeEnd, grid = true, codes = true, showInfo = true }: {
  pattern: BeadPattern; palette: CompiledBeadColor[]; selected?: string[]; completed?: string[];
  onCell?: (row: number, col: number) => void; height?: number; drawing?: boolean;
  onStrokeStart?: () => void; onStrokeEnd?: () => void; grid?: boolean; codes?: boolean; showInfo?: boolean;
}) {
  const [width, setWidth] = useState(300);
  const height = fixedHeight ?? width;
  const columns = pattern.metadata.width;
  const rows = pattern.metadata.height;
  const fit = Math.min((width - 12) / (columns * 24), (height - 12) / (rows * 24));
  const [zoom, setZoom] = useState({ fit, scale: fit });
  const view = useSharedValue({ x: (width - columns * 24 * fit) / 2, y: (height - rows * 24 * fit) / 2, scale: fit });
  const session = useSharedValue<Session | null>(null);
  const scrollGesture = useContext(ScrollGestureContext);
  const lastCell = useRef<{ row: number; col: number } | null>(null);
  useEffect(() => {
    view.set({ x: (width - columns * 24 * fit) / 2, y: (height - rows * 24 * fit) / 2, scale: fit });
  }, [width, height, columns, rows, fit, view]);
  const transform = useDerivedValue(() => [{ translateX: view.value.x }, { translateY: view.value.y }, { scale: view.value.scale }]);
  const codeOpacity = useDerivedValue(() => codes && (!showInfo || view.value.scale >= 0.75) ? 1 : 0);
  const pictures = useMemo(() => {
    const record = (layer: 'chart' | 'codes') => {
      const recorder = Skia.PictureRecorder();
      drawChart(recorder.beginRecording(), pattern, palette, { cell: 24, codes: true, grid, selected, completed, layer });
      return recorder.finishRecordingAsPicture();
    };
    return { chart: record('chart'), codes: record('codes') };
  }, [pattern, palette, selected, completed, grid]);
  function startStroke() { lastCell.current = null; onStrokeStart?.(); }
  function endStroke() { lastCell.current = null; onStrokeEnd?.(); }
  function resetCells() { lastCell.current = null; }
  function cell(row: number, col: number) {
    if (row < 0 || col < 0 || row >= rows || col >= columns) return;
    const last = lastCell.current;
    if (last?.row === row && last.col === col) return;
    if (drawing && last) {
      const count = Math.max(Math.abs(row - last.row), Math.abs(col - last.col));
      for (let i = 1; i <= count; i++) onCell?.(Math.round(last.row + (row - last.row) * i / count), Math.round(last.col + (col - last.col) * i / count));
    } else onCell?.(row, col);
    lastCell.current = { row, col };
  }
  function sendCell(point: BoardTouch) {
    'worklet';
    if (!onCell) return;
    const row = Math.floor((point.y - view.value.y) / (24 * view.value.scale));
    const col = Math.floor((point.x - view.value.x) / (24 * view.value.scale));
    scheduleOnRN(cell, row, col);
  }
  const gesture = useManualGesture({
    block: scrollGesture, shouldCancelWhenOutside: false,
    onTouchesDown: event => {
      'worklet';
      cancelAnimation(view);
      const active: Session = session.value || { start: event.changedTouches[0], moved: false, multi: false, stroke: false, pair: null };
      if (event.allTouches.length >= 2) {
        active.multi = true;
        if (active.stroke) { scheduleOnRN(endStroke); active.stroke = false; }
        active.pair = touchPair(event.allTouches, active.pair);
      }
      session.value = active;
      // 保留图纸内的触摸，第一指移动后再落第二指也不会被页面滚动截断。
      GestureStateManager.activate(event.handlerTag);
    },
    onTouchesMove: event => {
      'worklet';
      const active = session.value;
      if (!active) return;
      if (event.allTouches.length >= 2) {
        active.multi = true;
        if (active.stroke) { scheduleOnRN(endStroke); active.stroke = false; }
        const pair = touchPair(event.allTouches, active.pair)!;
        if (active.pair) view.set(moveBoard(view.value, active.pair, pair, fit, Math.max(fit, 64 / 24)));
        active.pair = pair;
      } else if (!active.multi && event.allTouches.length) {
        const point = event.allTouches[0];
        if (Math.hypot(point.x - active.start.x, point.y - active.start.y) > 8) active.moved = true;
        if (drawing && onCell && active.moved) {
          if (!active.stroke) { scheduleOnRN(startStroke); active.stroke = true; sendCell(active.start); }
          sendCell(point);
        }
      }
      session.value = active;
    },
    onTouchesUp: event => {
      'worklet';
      const active = session.value;
      if (!active) return;
      const remaining = remainingTouches(event.allTouches, event.changedTouches);
      active.pair = touchPair(remaining, active.pair);
      if (!remaining.length) {
        if (!active.multi && !active.moved && onCell) {
          if (drawing) { scheduleOnRN(startStroke); active.stroke = true; }
          sendCell(event.changedTouches[0]);
        }
        if (active.stroke) { scheduleOnRN(endStroke); active.stroke = false; }
        session.value = active;
        GestureStateManager.deactivate(event.handlerTag);
      } else session.value = active;
    },
    onFinalize: () => {
      'worklet';
      if (session.value?.stroke) scheduleOnRN(endStroke);
      session.value = null;
      // 拖动过程中不限制位置；只有整张图纸几乎移出时，松手后保留一小块可抓取区域。
      const current = view.value;
      const visibleX = Math.min(48, width, columns * 24 * current.scale);
      const visibleY = Math.min(48, height, rows * 24 * current.scale);
      const x = Math.max(visibleX - columns * 24 * current.scale, Math.min(width - visibleX, current.x));
      const y = Math.max(visibleY - rows * 24 * current.scale, Math.min(height - visibleY, current.y));
      if (x !== current.x || y !== current.y) view.set(withTiming({ ...current, x, y }, { duration: 160 }));
      scheduleOnRN(resetCells);
      scheduleOnRN(setZoom, { fit, scale: view.value.scale });
    },
  });
  return <View style={{ gap: 8 }}>
    {showInfo && <Text style={styles.hint}>缩放 {Math.round((zoom.fit === fit ? zoom.scale : fit) * 100)}%</Text>}
    <GestureDetector gesture={gesture}><View collapsable={false} style={[styles.viewport, { height }]}
      onLayout={event => setWidth(event.nativeEvent.layout.width)}>
      <Canvas style={{ width, height }} pointerEvents="none">
        <Group transform={transform}><Picture picture={pictures.chart} /><Group opacity={codeOpacity}><Picture picture={pictures.codes} /></Group></Group>
      </Canvas>
    </View></GestureDetector>
    {showInfo && <Text style={styles.hint}>双指缩放、双指平移{onCell ? drawing ? ' · 单指绘制' : ' · 单指点击格子' : ''}</Text>}
  </View>;
}
const styles = StyleSheet.create({
  viewport: { overflow: 'hidden' },
  hint: { color: '#896b7a', fontSize: 11, lineHeight: 17 },
});
