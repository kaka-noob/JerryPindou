// 本文件定义勾选同时生成镜像时应保存的独立图纸版本。
export type ImageVariant = 'original' | 'mirror';

// 按选项返回原图与镜像图，未勾选时只保存原图。
export function getImageVariants(withMirror: boolean): ImageVariant[] {
  return withMirror ? ['original', 'mirror'] : ['original'];
}
