// 本文件提供原生图纸预览、双向滚动、缩放与格子点击定位。
import { useMemo, useRef, useState, type ComponentRef } from 'react';
import { ScrollView, View, StyleSheet, Text } from 'react-native';
import { Canvas, Group, Picture, Skia } from '@shopify/react-native-skia';
import type { BeadPattern, CompiledBeadColor } from '@/lib/types/bead';
import { drawChart } from '../services/drawing';
import { Action } from './controls';

// 缓存 Skia 图形指令，仅在图纸或显示选项改变后重新绘制。
export function PatternBoard({ pattern, palette, selected, completed, onCell }: {
  pattern: BeadPattern; palette: CompiledBeadColor[]; selected: string[]; completed: string[];
  onCell: (row: number, col: number) => void;
}) {
  const [cell, setCell] = useState(24);
  const [viewportWidth, setViewportWidth] = useState(320);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const horizontal = useRef<ComponentRef<typeof ScrollView>>(null);
  const vertical = useRef<ComponentRef<typeof ScrollView>>(null);
  const touchStart = useRef({ x: 0, y: 0 });
  // 缩放时重置滚动位置，避免旧偏移超出新图纸。
  function changeScale(next: number) {
    horizontal.current?.scrollTo({ x: 0, animated: false });
    vertical.current?.scrollTo({ y: 0, animated: false });
    setOffset({ x: 0, y: 0 });
    setCell(next);
  }
  const picture = useMemo(() => {
    const recorder = Skia.PictureRecorder();
    drawChart(recorder.beginRecording(), pattern, palette, { cell, codes: true, selected, completed });
    return recorder.finishRecordingAsPicture();
  }, [pattern, palette, cell, selected, completed]);
  const width = pattern.metadata.width * cell + 1;
  const height = pattern.metadata.height * cell + 1;
  return <View style={styles.wrapper}>
    <View style={styles.toolbar}>
      <Action title="缩小" disabled={cell <= 8} onPress={() => changeScale(Math.max(8, cell - 8))} />
      <Text style={styles.scale}>{Math.round(cell / 24 * 100)}%</Text>
      <Action title="放大" disabled={cell >= 64} onPress={() => changeScale(Math.min(64, cell + 8))} />
    </View>
    <View style={styles.viewport} onLayout={event => setViewportWidth(event.nativeEvent.layout.width - 2)}>
      <ScrollView ref={horizontal} horizontal nestedScrollEnabled scrollEventThrottle={16}
        onScroll={event => { const x = event.nativeEvent.contentOffset.x; setOffset(previous => ({ ...previous, x })); }}>
      <ScrollView ref={vertical} nestedScrollEnabled style={{ width: Math.max(width, viewportWidth), height: 378 }} scrollEventThrottle={16}
        onScroll={event => { const y = event.nativeEvent.contentOffset.y; setOffset(previous => ({ ...previous, y })); }}>
        <View style={{ width: Math.max(width, viewportWidth), height: Math.max(height, 378) }}>
        <View style={{ position: 'absolute', left: offset.x, top: offset.y, width: viewportWidth, height: 378 }}
          onStartShouldSetResponder={() => true} onResponderGrant={event => {
          touchStart.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
        }} onResponderRelease={event => {
          if (Math.hypot(event.nativeEvent.pageX - touchStart.current.x, event.nativeEvent.pageY - touchStart.current.y) > 8) return;
          const row = Math.floor((event.nativeEvent.locationY + offset.y) / cell);
          const col = Math.floor((event.nativeEvent.locationX + offset.x) / cell);
          if (row >= 0 && col >= 0 && row < pattern.metadata.height && col < pattern.metadata.width) onCell(row, col);
        }}>
          {/* 画布始终只分配可见窗口大小，防止大图放大后耗尽手机显存。 */}
          <Canvas style={{ width: viewportWidth, height: 378 }} pointerEvents="none">
            <Group transform={[{ translateX: -offset.x }, { translateY: -offset.y }]}><Picture picture={picture} /></Group>
          </Canvas>
        </View>
        </View>
      </ScrollView>
      </ScrollView>
    </View>
    <Text style={styles.hint}>拖动查看图纸；每五颗为粗网格，放大后显示色号。</Text>
  </View>;
}

const styles = StyleSheet.create({
  // 图纸区采用弹性布局容纳工具栏与画布。
  wrapper: { gap: 10 },
  // 缩放按钮横向排列。
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // 缩放比例使用固定数字宽度。
  scale: { color: '#52645b', fontVariant: ['tabular-nums'] },
  // 预览窗口限制高度，避免整张大图撑开页面。
  viewport: { height: 380, flexGrow: 0, borderWidth: 1, borderColor: '#bdcdbf', borderRadius: 8 },
  // 操作说明文字。
  hint: { color: '#65746c', fontSize: 12, lineHeight: 18 },
});
