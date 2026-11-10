// 本文件使用原生图片解码与 Skia 读取像素，不依赖浏览器 Canvas。
import { Skia, ColorType, AlphaType } from '@shopify/react-native-skia';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { PatternPixels } from '@/lib/engine/pattern-recognition';

// 按最大边长缩小手机照片，控制解码内存，并统一为未预乘的 RGBA 像素。
export async function readPixels(uri: string): Promise<PatternPixels> {
  const maxSide = 1600;
  const context = ImageManipulator.manipulate(uri, { maxWidth: maxSide, maxHeight: maxSide });
  const rendered = await context.renderAsync();
  const image = await rendered.saveAsync({ format: SaveFormat.PNG });
  const encoded = await Skia.Data.fromURI(image.uri);
  const decoded = Skia.Image.MakeImageFromEncoded(encoded);
  if (!decoded) throw new Error('无法解码图片，请尝试 PNG 或 JPG。');
  const pixels = decoded.readPixels(0, 0, {
    width: decoded.width(), height: decoded.height(), colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul,
  });
  if (!pixels) throw new Error('无法读取图片像素。');
  const result = { width: decoded.width(), height: decoded.height(), data: new Uint8ClampedArray(pixels) };
  decoded.dispose();
  return result;
}
