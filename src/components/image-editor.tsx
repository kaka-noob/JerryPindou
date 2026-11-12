// 自由比例裁剪框按图片实际显示范围映射坐标，不依赖平台的方形系统裁剪。
import { useRef, useState } from 'react';
import { Image, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import type { SourceImage } from '../state/studio';

export type Crop = { originX: number; originY: number; width: number; height: number };
export function ImageCropper({ image, crop, onChange }: { image: SourceImage; crop: Crop; onChange: (crop: Crop) => void }) {
  const [available, setAvailable] = useState(320);
  const scale = Math.min(available / image.width, 330 / image.height);
  const start = useRef<{ x: number; y: number; crop: Crop; corner: string } | null>(null);
  const begin = (event: GestureResponderEvent, corner: string) => {
    start.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY, crop, corner };
  };
  const move = (event: GestureResponderEvent) => {
    const from = start.current;
    if (!from) return;
    const dx = (event.nativeEvent.pageX - from.x) / scale;
    const dy = (event.nativeEvent.pageY - from.y) / scale;
    const original = from.crop;
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
    if (from.corner === 'move') {
      onChange({ ...original, originX: clamp(original.originX + dx, 0, image.width - original.width), originY: clamp(original.originY + dy, 0, image.height - original.height) });
      return;
    }
    const minW = Math.min(image.width, Math.max(1, 24 / scale));
    const minH = Math.min(image.height, Math.max(1, 24 / scale));
    const left = from.corner.includes('l') ? clamp(original.originX + dx, 0, original.originX + original.width - minW) : original.originX;
    const top = from.corner.includes('t') ? clamp(original.originY + dy, 0, original.originY + original.height - minH) : original.originY;
    const right = from.corner.includes('r') ? clamp(original.originX + original.width + dx, left + minW, image.width) : original.originX + original.width;
    const bottom = from.corner.includes('b') ? clamp(original.originY + original.height + dy, top + minH, image.height) : original.originY + original.height;
    onChange({ originX: left, originY: top, width: right - left, height: bottom - top });
  };
  return <View style={{ gap: 12 }} onLayout={event => setAvailable(event.nativeEvent.layout.width)}>
    <View style={{ width: image.width * scale, height: image.height * scale, alignSelf: 'center' }}>
      <Image source={{ uri: image.uri }} style={StyleSheet.absoluteFill} resizeMode="contain" accessibilityLabel="待编辑图片" />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#00000050' }]} pointerEvents="none" />
      <View style={{ position: 'absolute', left: crop.originX * scale, top: crop.originY * scale, width: crop.width * scale, height: crop.height * scale,
        borderWidth: 2, borderColor: '#ff4081', overflow: 'visible' }}
        onStartShouldSetResponder={() => true} onResponderGrant={event => begin(event, 'move')} onResponderMove={move} onResponderTerminationRequest={() => false}>
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderWidth: 1, borderColor: '#ffffff' }]} />
        {['tl', 'tr', 'bl', 'br'].map(corner => <View key={corner} accessibilityLabel={`裁剪${corner}角`} style={{ position: 'absolute', width: 36, height: 36,
          backgroundColor: '#ff408150', borderColor: '#ffffff', borderWidth: 2,
          ...(corner.includes('l') ? { left: -12 } : { right: -12 }), ...(corner.includes('t') ? { top: -12 } : { bottom: -12 }) }}
          onStartShouldSetResponder={() => true} onResponderGrant={event => begin(event, corner)} onResponderMove={move} onResponderTerminationRequest={() => false} />)}
      </View>
    </View>
    <Text style={{ color: '#816777', fontSize: 12 }}>拖动四角自由裁剪，拖动框内移动选区。</Text>
  </View>;
}
