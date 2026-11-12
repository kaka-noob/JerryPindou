// 本文件提供带无障碍标签的原生操作按钮、选项和数值输入框。
import { useState, type ReactNode } from 'react';
import { Pressable, Text, TextInput, View, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';

// 提供适合触摸的工作台操作按钮。
export function Action({ title, onPress, disabled = false, active = false }: {
  title: string; onPress: () => void; disabled?: boolean; active?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled, selected: active }}
    disabled={disabled} onPress={onPress} style={[styles.button, active && styles.active, disabled && styles.disabled]}>
    <Text style={[styles.buttonText, active && styles.activeText]}>{title}</Text>
  </Pressable>;
}

// 使用可换行的选项按钮适配不同屏幕宽度与系统字体。
export function Choices<T extends string>({ items, value, onChange }: {
  items: readonly (readonly [T, string])[]; value: T; onChange: (value: T) => void;
}) {
  return <View style={styles.row}>{items.map(([key, title]) => <Action key={key} title={title}
    active={value === key} onPress={() => onChange(key)} />)}</View>;
}

// 展示带中文标题的功能区。
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return <View style={styles.section}><Text style={styles.title}>{title}</Text>{children}</View>;
}

// 接收数字草稿并在完成编辑时提交，允许用户先清空再输入。
export function NumberField({ title, value, onChange }: { title: string; value: number; onChange: (value: number) => void }) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  return <View style={styles.field}><Text style={styles.label}>{title}</Text>
    <TextInput accessibilityLabel={title} value={focused ? text : String(value)} keyboardType="numbers-and-punctuation"
      onFocus={() => { setText(String(value)); setFocused(true); }} onBlur={() => setFocused(false)}
      selectTextOnFocus onChangeText={next => { setText(next); if (/^-?\d+$/.test(next)) onChange(Number(next)); }}
      onEndEditing={() => setText(String(value))} style={styles.input} />
  </View>;
}

// 每个参数独占一行，拖动时展示整数值并沿用页面的预览更新队列。
// 正负参数以零点为起点显示变化，避免默认零值呈现半条进度。
export function SliderField({ title, value, minimum, maximum, onChange }: {
  title: string; value: number; minimum: number; maximum: number; onChange: (value: number) => void;
}) {
  const bipolar = minimum < 0 && maximum > 0;
  const zero = -minimum / (maximum - minimum) * 100;
  const position = (value - minimum) / (maximum - minimum) * 100;
  // 每次按步进一格；到达边界时保持原值，按钮仍可点击。
  function adjust(delta: number) {
    const next = Math.max(minimum, Math.min(maximum, value + delta));
    if (next !== value) onChange(next);
  }
  return <View style={styles.sliderRow}>
    <Text style={styles.sliderLabel}>{title}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}减一`} hitSlop={6}
      onPress={() => adjust(-1)} style={styles.stepButton}><Text style={styles.stepButtonText}>-</Text></Pressable>
    <View style={styles.sliderControl}>
    <Slider accessibilityLabel={title} accessibilityValue={{ min: minimum, max: maximum, now: value }}
      value={value} minimumValue={minimum} maximumValue={Math.max(minimum + 1, maximum)} disabled={maximum <= minimum} step={1} thumbSize={22} tapToSeek
      minimumTrackTintColor={bipolar ? '#eadfe5' : '#df4b89'} maximumTrackTintColor="#eadfe5" thumbTintColor="#df4b89" style={styles.slider}
      onValueChange={next => {
        const rounded = Math.max(minimum, Math.min(maximum, Math.round(next)));
        if (rounded !== value) onChange(rounded);
      }} />
      {bipolar && <View pointerEvents="none" style={styles.signedTrack}>
        {/* 有色区间只连接零点和当前值；零值时宽度为零。 */}
        <View style={[styles.signedFill, { left: `${Math.min(zero, position)}%`, width: `${Math.abs(position - zero)}%` }]} />
        {/* 中央刻度明确标识零点。 */}
        <View style={[styles.zeroTick, { left: `${zero}%` }]} />
      </View>}
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}加一`} hitSlop={6}
      onPress={() => adjust(1)} style={styles.stepButton}><Text style={styles.stepButtonText}>+</Text></Pressable>
    <Text style={styles.sliderValue}>{bipolar && value > 0 ? '+' : ''}{value}</Text>
  </View>;
}

const styles = StyleSheet.create({
  // 参数标签、滑块和数值使用横向弹性布局。
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 48 },
  // 标签固定宽度以便各行轨道对齐。
  sliderLabel: { width: 68, color: '#614555', fontSize: 14 },
  // 滑块两侧步进按钮使用固定尺寸，保留稳定触摸区域。
  stepButton: { width: 24, height: 32, alignItems: 'center', justifyContent: 'center' },
  // 加减符号清晰显示但不抢占数值层级。
  stepButtonText: { color: '#896b7a', fontSize: 18, fontWeight: '600', textAlign: 'center' },
  // 滑块容器为零点刻度提供定位基准。
  sliderControl: { flex: 1, minHeight: 48, justifyContent: 'center' },
  // 原生滑块填满中间可用空间。
  slider: { flex: 1, minHeight: 48 },
  // 正负参数的辅助轨道避开两端滑块半径。
  signedTrack: { position: 'absolute', left: 16, right: 16, top: 23, height: 2 },
  // 从零点到当前值绘制实际调整区间。
  signedFill: { position: 'absolute', height: 2, backgroundColor: '#df4b89' },
  // 零点使用细刻度，便于辨认原样位置。
  zeroTick: { position: 'absolute', top: -15, height: 4, width: 1, backgroundColor: '#b69aa8' },
  // 数值使用等宽数字，并预留正负号空间。
  sliderValue: { width: 36, textAlign: 'right', color: '#614555', fontSize: 14, fontVariant: ['tabular-nums'] },
  // 按钮提供至少四十四点的触摸高度。
  button: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12, backgroundColor: '#f9eaf2', justifyContent: 'center' },
  // 选中操作使用主题绿色。
  active: { backgroundColor: '#bd326c' },
  // 禁用操作降低可见度。
  disabled: { opacity: 0.45 },
  // 普通按钮文字。
  buttonText: { fontSize: 14, fontWeight: '600', color: '#614555', textAlign: 'center' },
  // 选中按钮文字保证对比度。
  activeText: { color: '#ffffff' },
  // 选项使用可换行弹性布局。
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // 功能区卡片按内容自适应高度。
  section: { backgroundColor: '#ffffff', borderRadius: 18, padding: 16, gap: 14 },
  // 功能区标题。
  title: { color: '#45283b', fontSize: 18, fontWeight: '700' },
  // 数值字段共享可用宽度。
  field: { flex: 1, minWidth: 80, gap: 7 },
  // 字段标签。
  label: { color: '#896b7a', fontSize: 13 },
  // 数值输入框保留清晰边界。
  input: { minHeight: 46, borderWidth: 1, borderColor: '#edd5e2', borderRadius: 10, paddingHorizontal: 12, color: '#45283b', fontSize: 16 },
});
