// 首页四个真实 Tab 保留相同的底栏，创作流程在外层 Stack 中全屏显示。
import { Tabs } from 'expo-router';
import { Text } from 'react-native';

export default function HomeTabs() {
  return <Tabs screenOptions={{ tabBarActiveTintColor: '#bd326c', tabBarInactiveTintColor: '#9a8190',
    tabBarStyle: { backgroundColor: '#fffafd', borderTopColor: '#f2dde8' },
    headerStyle: { backgroundColor: '#fff5fa' }, headerTintColor: '#45283b' }}>
    {([['index', '首页', '⌂'], ['templates', '模板', '▦'], ['tutorials', '教程', '▷'], ['profile', '我的', '♡']] as const).map(([name, title, icon]) =>
      <Tabs.Screen key={name} name={name} options={{ title, tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 24 }}>{icon}</Text> }} />)}
  </Tabs>;
}
