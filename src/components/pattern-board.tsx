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
// 用分层图片显示可缩放图纸，结果预览可附加坐标和镜像。
export function PatternBoard({ pattern, palette, selected = EMPTY_IDS, completed = EMPTY_IDS, onCell, height: fixedHeight,
  drawing = false, onStrokeStart, onStrokeEnd, grid = true, codes = true, showInfo = true, mirror = false, coordinates = false }: {
  pattern: BeadPattern; palette: CompiledBeadColor[]; selected?: string[]; completed?: string[];
  onCell?: (row: number, col: number) => void; height?: number; drawing?: boolean;
  onStrokeStart?: () => void; onStrokeEnd?: () => void; grid?: boolean; codes?: boolean; showInfo?: boolean; mirror?: boolean; coordinates?: boolean;
}) {
  const [width, setWidth] = useState(300);
  const height = fixedHeight ?? width;
  const columns = pattern.metadata.width;
  const rows = pattern.metadata.height;
  const boardWidth = (columns + (coordinates ? 2 : 0)) * 24;
  const boardHeight = (rows + (coordinates ? 2 : 0)) * 24;
  const fit = Math.min((width - 12) / boardWidth, (height - 12) / boardHeight);
  const [zoom, setZoom] = useState({ fit, scale: fit });
  const view = useSharedValue({ x: (width - boardWidth * fit) / 2, y: (height - boardHeight * fit) / 2, scale: fit });
  const session = useSharedValue<Session | null>(null);
  const scrollGesture = useContext(ScrollGestureContext);
  const lastCell = useRef<{ row: number; col: number } | null>(null);
  useEffect(() => {
    view.set({ x: (width - boardWidth * fit) / 2, y: (height - boardHeight * fit) / 2, scale: fit });
  }, [width, height, boardWidth, boardHeight, fit, view]);
  const transform = useDerivedValue(() => [{ translateX: view.value.x }, { translateY: view.value.y }, { scale: view.value.scale }]);
  const codeOpacity = useDerivedValue(() => codes && (!showInfo || view.value.scale >= 0.75) ? 1 : 0);
  const pictures = useMemo(() => {
    // 分别录制底图和色号，缩放时无需重新生成所有格子。
    const record = (layer: 'chart' | 'codes') => {
      const recorder = Skia.PictureRecorder();
      drawChart(recorder.beginRecording(), pattern, palette, { cell: 24, codes: true, grid, mirror, coordinates, selected, completed, layer });
      return recorder.finishRecordingAsPicture();
    };
    return { chart: record('chart'), codes: record('codes') };
  }, [pattern, palette, selected, completed, grid, mirror, coordinates]);
  // 开始一笔绘制前清空上次落点。
  function startStroke() { lastCell.current = null; onStrokeStart?.(); }
  // 结束绘制并通知工作台提交撤销记录。
  function endStroke() { lastCell.current = null; onStrokeEnd?.(); }
  // 手势结束后清理格子去重状态。
  function resetCells() { lastCell.current = null; }
  // 连续绘制时插值补齐格子，避免快速移动漏画。
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
  // 把当前缩放、坐标边距和镜像位置换算回原图格子。
  function sendCell(point: BoardTouch) {
    'worklet';
    if (!onCell) return;
    const row = Math.floor((point.y - view.value.y) / (24 * view.value.scale)) - (coordinates ? 1 : 0);
    const col = Math.floor((point.x - view.value.x) / (24 * view.value.scale)) - (coordinates ? 1 : 0);
    scheduleOnRN(cell, row, mirror ? columns - 1 - col : col);
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
      const visibleX = Math.min(48, width, boardWidth * current.scale);
      const visibleY = Math.min(48, height, boardHeight * current.scale);
      const x = Math.max(visibleX - boardWidth * current.scale, Math.min(width - visibleX, current.x));
      const y = Math.max(visibleY - boardHeight * current.scale, Math.min(height - visibleY, current.y));
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
  // 图纸超出视口时裁切，手势仍可平移查看。
  viewport: { overflow: 'hidden' },
  // 缩放信息和手势说明使用轻量文字。
  hint: { color: '#896b7a', fontSize: 11, lineHeight: 17 },
});
