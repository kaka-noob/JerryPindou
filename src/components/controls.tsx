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
export function SliderField({ title, value, minimum, maximum, onChange }: {
  title: string; value: number; minimum: number; maximum: number; onChange: (value: number) => void;
}) {
  return <View style={styles.sliderRow}>
    <Text style={styles.sliderLabel}>{title}</Text>
    <Slider accessibilityLabel={title} accessibilityValue={{ min: minimum, max: maximum, now: value }}
      value={value} minimumValue={minimum} maximumValue={maximum} step={1} thumbSize={22} tapToSeek
      minimumTrackTintColor="#df4b89" maximumTrackTintColor="#eadfe5" thumbTintColor="#df4b89" style={styles.slider}
      onValueChange={next => {
        const rounded = Math.max(minimum, Math.min(maximum, Math.round(next)));
        if (rounded !== value) onChange(rounded);
      }} />
    <Text style={styles.sliderValue}>{value}</Text>
  </View>;
}

const styles = StyleSheet.create({
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  sliderLabel: { width: 68, color: '#614555', fontSize: 14 },
  slider: { flex: 1, minHeight: 48 },
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
