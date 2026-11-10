// 本文件配置工作台的原生导航栏和系统状态栏。
import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { StudioProvider } from '../state/studio';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationBar } from 'expo-navigation-bar';

// 使用原生导航栈承载手机工作台。
export default function RootLayout() {
  return <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#fffafd' }}><StudioProvider><StatusBar style="dark" /><NavigationBar style="dark" /><Stack screenOptions={{ headerStyle: { backgroundColor: '#fff5fa' }, headerTintColor: '#45283b', contentStyle: { backgroundColor: '#fff5fa' } }}>
    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
  </Stack></StudioProvider></GestureHandlerRootView>;
}
