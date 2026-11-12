// 本文件将原生图片像素接入共用拼豆算法，并静态加载离线品牌色板。
import type { BeadBrand, BeadPattern, CompiledBeadColor, DitheringMode } from '@/lib/types/bead';
import { downscaleSteps } from '@/lib/engine/downscaler';
import { matchColor } from '@/lib/engine/color-matcher';
import { adjustPixels } from '@/lib/engine/adjustments';
import { cropToSubjectSteps } from '@/lib/engine/subject-crop';
import { majorityFilter, removeIsolatedNoise } from '@/lib/engine/pattern-cleanup';
import { buildUsageMap, limitPaletteWithKeyColors } from '@/lib/engine/palette-limit';
import { CREATIVE_MODE_SETTINGS, type CreativeMode } from '@/lib/engine/creative-mode';
import { recognizePatternFromPixels, type PatternPixels } from '@/lib/engine/pattern-recognition';
import mard from '@/lib/data/palettes/mard.json';
import hama from '@/lib/data/palettes/hama.json';
import perler from '@/lib/data/palettes/perler.json';
import artkal from '@/lib/data/palettes/artkal-s.json';
import coco from '@/lib/data/palettes/coco.json';
import manman from '@/lib/data/palettes/manman.json';
import panpan from '@/lib/data/palettes/panpan.json';
import mixiaowo from '@/lib/data/palettes/mixiaowo.json';

export const BRANDS = [
  ['mard', 'MARD'], ['hama', 'Hama'], ['perler', 'Perler'], ['artkal-s', 'Artkal S'],
  ['coco', 'COCO'], ['manman', '漫漫'], ['panpan', '盼盼'], ['mixiaowo', '咪小窝'],
] as const;
const palettes = { mard, hama, perler, 'artkal-s': artkal, coco, manman, panpan, mixiaowo };
export type WorkMode = 'generate' | 'recognize' | 'highlight';
export interface Settings {
  brand: keyof typeof palettes;
  width: number;
  height: number;
  lockRatio: boolean;
  maxColors: number;
  creative: CreativeMode;
  dithering: DitheringMode;
  background: 'white' | 'black' | 'transparent';
  excluded: string[];
  autoGrid: boolean;
  brightness: number;
  contrast: number;
  saturation: number;
}
export const DEFAULT_SETTINGS: Settings = {
  brand: 'mard', width: 58, height: 58, lockRatio: true, maxColors: 60,
  creative: 'fine', dithering: 'none', background: 'white', excluded: [], autoGrid: true,
  brightness: 0, contrast: 0, saturation: 0,
};

// 获取已打包的品牌色板，避免原生打包器无法解析动态导入路径。
export function getPalette(brand: Settings['brand']): CompiledBeadColor[] {
  return palettes[brand] as CompiledBeadColor[];
}

// 验证颗数范围，防止无效参数进入生成与识别算法。
export function validSize(value: number): number {
  return Math.max(1, Math.min(200, Math.round(value) || 1));
}

// 从原生解码后的像素生成或识别图纸，复用网页的颜色计算与清理算法。
export function createPattern(source: PatternPixels, settings: Settings, mode: WorkMode) {
  const steps = patternSteps(source, settings, mode);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

// 同一条生成管线既可同步验证，也可分片运行；取消时不再继续昂贵的颜色匹配。
export async function createPatternAsync(source: PatternPixels, settings: Settings, mode: WorkMode, cancelled: () => boolean) {
  const steps = patternSteps(source, settings, mode);
  let deadline = Date.now() + 8;
  for (;;) {
    if (cancelled()) throw new Error('预览已更新');
    const step = steps.next();
    if (step.done) return step.value;
    if (Date.now() >= deadline) {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      deadline = Date.now() + 8;
    }
  }
}

// 分步处理像素、限色和图纸数据，预览与最终生成共用同一算法。
function* patternSteps(source: PatternPixels, settings: Settings, mode: WorkMode) {
  let palette = getPalette(settings.brand).filter(color => !settings.excluded.includes(color.id));
  if (!palette.length) throw new Error('至少保留一种可用颜色。');
  if (mode !== 'generate') {
    const result = recognizePatternFromPixels(source, { ...settings, palette, preferAutoGrid: settings.autoGrid });
    if (result.pattern.metadata.width > 200 || result.pattern.metadata.height > 200) {
      return recognizePatternFromPixels(source, { ...settings, palette, preferAutoGrid: false });
    }
    return result;
  }
  const preset = CREATIVE_MODE_SETTINGS[settings.creative];
  const data = new Uint8ClampedArray(source.data);
  for (let index = 0; index < data.length; index += 4) {
    if (index % 4096 === 0) yield;
    const alpha = data[index + 3] / 255;
    const background = settings.background === 'black' ? 0 : 255;
    for (let channel = 0; channel < 3; channel++) {
      data[index + channel] = Math.round(data[index + channel] * alpha + background * (1 - alpha));
    }
  }
  const optimize = preset.lowResOptimize && settings.background !== 'transparent' && settings.width <= 58 && settings.height <= 58;
  const prepared = optimize
    ? yield* cropToSubjectSteps(data, source.width, source.height, { background: settings.background })
    : { data, width: source.width, height: source.height };
  const pixels = adjustPixels(yield* downscaleSteps(prepared.data, prepared.width, prepared.height,
    settings.width, settings.height, preset.pixMode, optimize ? { edgeLumaDelta: 10, dominantFill: true } : undefined),
  settings.brightness, preset.contrast + settings.contrast, preset.saturation + settings.saturation);
  // 透明格不参与限色统计，避免背景挤占主体颜色名额。
  const empty = pixels.map((_, index) => settings.background === 'transparent' && source.data[(
    Math.min(source.height - 1, Math.floor((Math.floor(index / settings.width) + 0.5) * source.height / settings.height)) * source.width
    + Math.min(source.width - 1, Math.floor((index % settings.width + 0.5) * source.width / settings.width))) * 4 + 3] < 20);
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  // 将匹配函数绑定到当前色板，限制颜色后再执行一次抖动。
  function* matchedPixels() {
    const buffer = pixels.map(pixel => ({ ...pixel }));
    const result: CompiledBeadColor[] = [];
    const cache = new Map<string, CompiledBeadColor>();
    for (let index = 0; index < buffer.length; index++) {
      if (index % 8 === 0) yield;
      const old = buffer[index];
      // 有序抖动采用 4×4 Bayer 阈值；误差扩散保留行间依赖。
      const delta = settings.dithering === 'ordered' ? (bayer[(Math.floor(index / settings.width) % 4) * 4 + index % settings.width % 4] - 7.5) * 2 : 0;
      const pixel = { r: Math.max(0, Math.min(255, old.r + delta)), g: Math.max(0, Math.min(255, old.g + delta)), b: Math.max(0, Math.min(255, old.b + delta)) };
      const key = `${pixel.r},${pixel.g},${pixel.b}`;
      const color = empty[index] ? palette[0] : cache.get(key) || matchColor(pixel, palette);
      if (!empty[index]) cache.set(key, color);
      result.push(color);
      if (settings.dithering !== 'floyd-steinberg' || empty[index]) continue;
      // 只向实际存在的图案格子扩散误差，不穿过透明区域。
      const spread = (target: number, weight: number) => {
        if (empty[target]) return;
        const next = buffer[target];
        for (const [channel, value] of [['r', color.rgb[0]], ['g', color.rgb[1]], ['b', color.rgb[2]]] as const) {
          next[channel] = Math.max(0, Math.min(255, Math.round(next[channel] + (old[channel] - value) * weight)));
        }
      };
      const x = index % settings.width;
      if (x + 1 < settings.width) spread(index + 1, 7 / 16);
      if (index + settings.width < buffer.length) {
        if (x > 0) spread(index + settings.width - 1, 3 / 16);
        spread(index + settings.width, 5 / 16);
        if (x + 1 < settings.width) spread(index + settings.width + 1, 1 / 16);
      }
    }
    return result;
  }
  let matched = yield* matchedPixels();
  const limited = limitPaletteWithKeyColors(palette, buildUsageMap(matched.filter((_, index) => !empty[index])), Math.min(settings.maxColors, palette.length));
  const retained = new Set(limited.limitedPalette.map(color => color.id));
  // 未损失已匹配色时复用第一遍结果；发生限色或启用抖动时保持完整重算。
  const unchanged = settings.dithering === 'none' && matched.every((color, index) => empty[index] || retained.has(color.id));
  palette = limited.limitedPalette.length ? limited.limitedPalette : [palette[0]];
  if (!unchanged) matched = yield* matchedPixels();
  let cells = Array.from({ length: settings.height }, (_, row) => Array.from({ length: settings.width }, (_, col) => ({
    colorId: empty[row * settings.width + col] ? palette[0].id : matched[row * settings.width + col].id,
    ...(empty[row * settings.width + col] ? { isEmpty: true } : {}),
  })));
  if (optimize) {
    const luma = new Map(palette.map(color => [color.id, 0.2126 * color.rgb[0] + 0.7152 * color.rgb[1] + 0.0722 * color.rgb[2]]));
    cells = majorityFilter(removeIsolatedNoise(cells, settings.width, settings.height, 2, new Set(limited.protectedIds), luma), settings.width, settings.height);
  }
  const pattern: BeadPattern = { version: 1, metadata: {
    brand: settings.brand as BeadBrand, width: settings.width, height: settings.height,
    dithering: settings.dithering, background: settings.background, createdAt: new Date().toISOString(),
  }, cells };
  return { pattern, palette, gridSource: null };
}
