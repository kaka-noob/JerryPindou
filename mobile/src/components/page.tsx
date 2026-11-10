// 统一粉色主题的页面容器；导航由 Expo Router 管理。
import type { ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router/stack';
import { useSegments } from 'expo-router';
import { GestureDetector, useNativeGesture } from 'react-native-gesture-handler';
import { ScrollGestureContext } from './scroll-gesture';
import { useStudio } from '../state/studio';

export function Page({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  const studio = useStudio();
  const inTabs = useSegments()[0] === '(tabs)';
  const scrollGesture = useNativeGesture();
  return <SafeAreaView edges={inTabs ? ['left', 'right'] : ['left', 'right', 'bottom']} style={[ui.screen, footer ? { backgroundColor: '#fffafd' } : null]}>
    <Stack.Screen options={{ title, headerTitleAlign: title === '生成效果' ? 'center' : undefined }} />
    {!studio.ready ? <View style={ui.center}><ActivityIndicator color="#df4b89" /><Text>正在恢复本地草稿…</Text></View> : <>
      <ScrollGestureContext.Provider value={scrollGesture}><GestureDetector gesture={scrollGesture}>
      <ScrollView keyboardShouldPersistTaps="handled" style={ui.screen} contentContainerStyle={ui.content}>
        {studio.error ? <Text accessibilityRole="alert" style={ui.error}>{studio.error}</Text> : null}{children}
      </ScrollView></GestureDetector></ScrollGestureContext.Provider>{footer ? <View style={ui.footer}>{footer}</View> : null}
    </>}
  </SafeAreaView>;
}
export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff5fa' },
  content: { padding: 18, gap: 18, paddingBottom: 32, width: '100%', maxWidth: 900, alignSelf: 'center' },
  footer: { padding: 16, gap: 10, borderTopWidth: 1, borderColor: '#f2dde8', backgroundColor: '#fffafd' },
  center: { flex: 1, minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  title: { color: '#45283b', fontWeight: '800', fontSize: 28 },
  label: { color: '#614555', fontWeight: '600', fontSize: 15 },
  note: { color: '#896b7a', fontSize: 12, lineHeight: 20 },
  error: { color: '#a0214d', padding: 14, backgroundColor: '#ffe4ed', borderRadius: 12, lineHeight: 21 },
  input: { minHeight: 46, borderWidth: 1, borderColor: '#edd5e2', borderRadius: 12, paddingHorizontal: 12, backgroundColor: '#ffffff', color: '#45283b' },
  swatch: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: '#dac9d2' },
});
