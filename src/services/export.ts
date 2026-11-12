// 本文件负责原生相册保存、系统分享、PDF 和工程文件导入导出。
import { File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import * as DocumentPicker from 'expo-document-picker';
import type { BeadPattern, CompiledBeadColor } from '@/lib/types/bead';
import { chartPng } from './drawing';
import { getPalette, BRANDS } from './pattern';
import { calculateUsage } from '@/lib/utils/usage-calculator';
import { imageFilename } from './export-filename';
import { getImageVariants, type ImageVariant } from './image-variants';

// 将指定原图或镜像图写入缓存目录。
async function imageFile(pattern: BeadPattern, palette: CompiledBeadColor[], display: { grid?: boolean; codes?: boolean; mirror?: boolean } = {}, variant?: ImageVariant) {
  const file = new File(Paths.cache, imageFilename(new Date(), variant));
  await file.write(chartPng(pattern, palette, display), { encoding: 'base64' });
  return file;
}

// 请求仅保存照片所需的权限后保存 PNG，拒绝授权时保留明确错误。
export async function saveImage(pattern: BeadPattern, palette: CompiledBeadColor[], display: { grid?: boolean; codes?: boolean; mirror?: boolean } = {}) {
  const permission = await MediaLibrary.requestPermissionsAsync(true);
  if (!permission.granted) throw new Error('需要允许保存图片到相册，也可以使用“分享 PNG”。');
  const variants = getImageVariants(!!display.mirror);
  const filenames: string[] = [];
  for (const variant of variants) {
    const file = await imageFile(pattern, palette, { ...display, mirror: variant === 'mirror' }, variants.length > 1 ? variant : undefined);
    filenames.push(file.name);
    try { await MediaLibrary.Asset.create(file.uri); }
    finally { if (file.exists) file.delete(); }
  }
  return filenames;
}

// 调用系统分享面板发送真实导出文件。
export async function shareFile(uri: string, mimeType: string) {
  if (!await Sharing.isAvailableAsync()) throw new Error('当前设备不支持系统分享。');
  await Sharing.shareAsync(uri, { mimeType, dialogTitle: '分享拼豆图纸' });
}

// 分享包含网格、色号和用量图例的 PNG。
export async function shareImage(pattern: BeadPattern, palette: CompiledBeadColor[]) {
  const file = await imageFile(pattern, palette);
  await shareFile(file.uri, 'image/png');
}

// 通过系统打印引擎生成包含完整图纸的 PDF 后分享。
export async function sharePdf(pattern: BeadPattern, palette: CompiledBeadColor[]) {
  const document = await Print.printToFileAsync({ base64: true, html: `<html><meta charset="UTF-8"><body><h1>Pindo 拼豆图纸</h1><img style="width:100%" src="data:image/png;base64,${chartPng(pattern, palette)}" /></body></html>` });
  if (!document.base64) throw new Error('PDF 生成失败，请重试。');
  // 将打印结果写入本应用缓存，兼容 Expo Go 的工程目录隔离。
  const file = new File(Paths.cache, `pindo-${Date.now()}.pdf`);
  await file.write(document.base64, { encoding: 'base64' });
  await shareFile(file.uri, 'application/pdf');
}

// 将可再次编辑的工程保存为标准 JSON 文件并分享。
export async function shareProject(pattern: BeadPattern, completed: string[], elapsed: number) {
  const file = new File(Paths.cache, `pindo-${Date.now()}.json`);
  await file.write(JSON.stringify({ pattern, completed, elapsed }));
  await shareFile(file.uri, 'application/json');
}

// 导出 UTF-8 无字节序标记的用量表，颜色名称按 CSV 规则转义。
export async function shareUsage(pattern: BeadPattern, palette: CompiledBeadColor[]) {
  const rows = calculateUsage(pattern, palette).map(item => [item.color.code, item.color.name, item.count]
    .map(value => `"${String(value).replace(/"/g, '""')}"`).join(','));
  const file = new File(Paths.cache, `pindo-usage-${Date.now()}.csv`);
  await file.write(['色号,名称,颗数', ...rows].join('\r\n'));
  await shareFile(file.uri, 'text/csv');
}

// 严格验证工程尺寸与颜色标识，避免损坏的外部文件进入原生画布。
export function validateProject(value: unknown): { pattern: BeadPattern; completed: string[]; elapsed: number } {
  const data = value as { pattern?: BeadPattern; completed?: unknown; elapsed?: unknown };
  const pattern = data?.pattern;
  if (!pattern || pattern.version !== 1 || !pattern.metadata || !BRANDS.some(([brand]) => brand === pattern.metadata.brand)) throw new Error('不是有效的 Pindo 工程。');
  const { width, height } = pattern.metadata;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 200 || height > 200) throw new Error('工程尺寸必须在 1–200 颗之间。');
  const ids = new Set(getPalette(pattern.metadata.brand as Parameters<typeof getPalette>[0]).map(color => color.id));
  if (!Array.isArray(pattern.cells) || pattern.cells.length !== height || pattern.cells.some(row => !Array.isArray(row) || row.length !== width || row.some(cell => !cell || !ids.has(cell.colorId)))) throw new Error('工程格子或色号数据不完整。');
  const completed = Array.isArray(data.completed) ? data.completed.filter((key): key is string => {
    if (typeof key !== 'string' || !/^\d+,\d+$/.test(key)) return false;
    const [row, col] = key.split(',').map(Number);
    return row < height && col < width && !pattern.cells[row][col].isEmpty;
  }) : [];
  return { pattern, completed: [...new Set(completed)], elapsed: typeof data.elapsed === 'number' && Number.isFinite(data.elapsed) ? Math.max(0, data.elapsed) : 0 };
}

// 使用系统文件选择器导入工程，取消选择不修改当前图纸。
export async function importProject() {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', 'application/octet-stream'], copyToCacheDirectory: false });
  if (result.canceled) return null;
  const file = new File(result.assets[0].uri);
  if ((result.assets[0].size || file.size) > 10 * 1024 * 1024) throw new Error('工程文件不能超过 10MB。');
  return validateProject(JSON.parse(await file.text()));
}
