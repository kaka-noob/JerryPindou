// 编辑确认后才替换参数页图片；取消保留既有图片草稿。
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File, Paths } from 'expo-file-system';
import { router } from 'expo-router';
import { Page, ui } from '../components/page';
import { Action, Section } from '../components/controls';
import { ImageCropper, type Crop } from '../components/image-editor';
import { fitSize } from '../services/editor';
import { useStudio, type SourceImage } from '../state/studio';

export function EditImage() {
  const studio = useStudio();
  const original = studio.pendingImage;
  const [image, setImage] = useState(original);
  const [crop, setCrop] = useState<Crop>({ originX: 0, originY: 0, width: original?.width || 1, height: original?.height || 1 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reset = (next: SourceImage) => { setImage(next); setCrop({ originX: 0, originY: 0, width: next.width, height: next.height }); };
  async function transform(operation: 'rotate' | 'flip' | 'confirm') {
    if (!image || busy) return;
    setBusy(true); setError('');
    try {
      const context = ImageManipulator.manipulate(image.uri);
      // 裁剪框跟随当前显示图片；先裁剪，再旋转/翻转以保持所见即所得。
      context.crop({ originX: Math.round(crop.originX), originY: Math.round(crop.originY),
        width: Math.max(1, Math.min(image.width - Math.round(crop.originX), Math.round(crop.width))),
        height: Math.max(1, Math.min(image.height - Math.round(crop.originY), Math.round(crop.height))) });
      if (operation === 'rotate') context.rotate(90);
      if (operation === 'flip') context.flip('horizontal');
      const rendered = await context.renderAsync();
      const result = await rendered.saveAsync({ format: SaveFormat.PNG });
      if (operation !== 'confirm') { reset(result); return; }
      // 将确认图片移到持久目录，避免系统清理缓存后草稿无法重新生成。
      const file = new File(Paths.document, `pindo-source-${Date.now()}.png`);
      await new File(result.uri).copy(file);
      const source = { ...result, uri: file.uri };
      studio.setConversion(previous => ({ ...previous, source, settings: { ...previous.settings,
        ...fitSize(Math.max(previous.settings.width, previous.settings.height), source.width, source.height) } }));
      studio.setPendingImage(null);
      router.replace('/parameters');
    } catch (error) { setError(error instanceof Error ? error.message : '图片编辑失败，请重试'); }
    finally { setBusy(false); }
  }
  return <Page title="编辑图片" footer={<View style={ui.row}>
    <Action title="取消" disabled={busy} onPress={() => { studio.setPendingImage(null); router.back(); }} />
    <View style={{ flex: 1 }}><Action title={busy ? '正在处理…' : '确认图片 →'} active disabled={busy || !image} onPress={() => void transform('confirm')} /></View>
  </View>}>
    {error ? <Text style={ui.error}>{error}</Text> : null}
    {image ? <Section title="让画面刚刚好"><ImageCropper image={image} crop={crop} onChange={setCrop} />
      <View style={ui.row}><Action title="水平翻转" disabled={busy} onPress={() => void transform('flip')} />
        <Action title="旋转 90°" disabled={busy} onPress={() => void transform('rotate')} />
        <Action title="重置" disabled={busy || !original} onPress={() => original && reset(original)} /></View>
      {busy && <ActivityIndicator color="#df4b89" />}
    </Section> : <Text style={ui.note}>请返回首页选择图片。</Text>}
  </Page>;
}
