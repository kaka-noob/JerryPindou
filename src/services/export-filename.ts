import type { ImageVariant } from './image-variants';

// 为原图和镜像图追加不同标记，避免同秒保存时文件名冲突。
export function imageFilename(date = new Date(), variant?: ImageVariant) {
  const pad = (number: number) => String(number).padStart(2, '0');
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `pd_${stamp}${variant ? `_${variant}` : ''}.png`;
}
