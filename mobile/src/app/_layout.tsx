// 本文件配置工作台的原生导航栏和系统状态栏。
import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';

// 使用原生导航栈承载手机工作台。
export default function RootLayout() {
  return <><StatusBar style="dark" /><Stack screenOptions={{ headerStyle: { backgroundColor: '#f3f5ef' }, headerTintColor: '#18392d', contentStyle: { backgroundColor: '#f3f5ef' } }}>
    <Stack.Screen name="index" options={{ title: 'Pindo 拼豆' }} />
  </Stack></>;
}
