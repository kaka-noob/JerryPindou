// 首页保留两个创作入口，精选模板留空，另三个 Tab 暂用占位页。
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Page, ui } from '../components/page';
import { Action } from '../components/controls';
import { emptyDraft, useStudio } from '../state/studio';

export function Home() {
  const studio = useStudio();
  const [busy, setBusy] = useState(false);
  async function choose() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (!result.canceled) { studio.setPendingImage(result.assets[0]); router.push('/image-edit'); }
    } catch (error) { Alert.alert('无法选图', error instanceof Error ? error.message : '请重试'); }
    finally { setBusy(false); }
  }
  return <Page title="拼小兔">
    <View style={{ gap: 9, paddingVertical: 15 }}><Text style={ui.title}>把喜欢，拼成作品。</Text><Text style={ui.note}>你的随身拼豆创作室 · v{Constants.expoConfig?.version}</Text></View>
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void choose()} style={{ backgroundColor: '#f9cee2', borderRadius: 26, padding: 26, gap: 16, minHeight: 170 }}>
      <Text style={{ fontSize: 34 }}>▦</Text><Text style={{ ...ui.title, fontSize: 23 }}>图片转拼豆图纸 →</Text><Text style={ui.note}>选一张喜欢的图片，调出专属配色。</Text>{busy && <ActivityIndicator color="#df4b89" />}
    </Pressable>
    <Pressable accessibilityRole="button" onPress={() => {
      if (!studio.drafts.creation) studio.updateDraft('creation', emptyDraft);
      router.push({ pathname: '/workbench', params: { kind: 'creation' } });
    }} style={{ backgroundColor: '#efe6fc', borderRadius: 26, padding: 24, gap: 12 }}>
      <Text style={{ ...ui.title, fontSize: 22 }}>✎ 自由创作画布 →</Text><Text style={ui.note}>{studio.drafts.creation ? '继续上次作品，让灵感接着发生。' : '从一块 29 × 29 的空白画布开始。'}</Text>
    </Pressable>
    {studio.drafts.conversion && <Action title="继续上次图片作品" onPress={() => router.push({ pathname: '/workbench', params: { kind: 'conversion' } })} />}
    <View style={ui.row}><Action title="导入已有工程" onPress={() => router.push({ pathname: '/workbench', params: { kind: 'conversion', import: 'yes' } })} />
      {studio.conversion.source && <Action title="继续调整图片参数" onPress={() => router.push('/parameters')} />}</View>
    <Text style={{ ...ui.label, marginTop: 14, fontSize: 20 }}>精选模板</Text><View style={{ minHeight: 110 }} />
  </Page>;
}
