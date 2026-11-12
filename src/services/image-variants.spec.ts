// 本文件验证同时生成镜像选项对应的一张或两张独立导出图纸。
import { describe, expect, it } from 'vitest';
import { getImageVariants } from './image-variants';

describe('导出图纸版本', () => {
  // 未勾选镜像时只导出原图。
  it('未勾选时仅返回原图', () => {
    expect(getImageVariants(false)).toEqual(['original']);
  });

  // 勾选镜像时按顺序导出原图和镜像图。
  it('勾选时返回两张方向不同的图纸', () => {
    expect(getImageVariants(true)).toEqual(['original', 'mirror']);
  });
});
