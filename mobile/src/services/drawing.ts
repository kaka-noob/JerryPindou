// 本文件通过 Skia 绘制图纸与色号，供原生预览和图片导出共用。
import { Skia, matchFont, PaintStyle, ImageFormat, type SkCanvas } from '@shopify/react-native-skia';
import type { BeadPattern, CompiledBeadColor } from '@/lib/types/bead';
import { calculateUsage } from '@/lib/utils/usage-calculator';

export interface DrawOptions { cell: number; codes: boolean; grid?: boolean; selected: string[]; completed: string[]; layer?: 'chart' | 'codes' }

// 根据格子和当前高亮状态绘制图纸，避免生成数万个原生视图。
export function drawChart(canvas: SkCanvas, pattern: BeadPattern, palette: CompiledBeadColor[], options: DrawOptions) {
  const colors = new Map(palette.map(color => [color.id, color]));
  const completed = new Set(options.completed);
  const paint = Skia.Paint();
  const font = matchFont({ fontFamily: 'sans-serif', fontSize: Math.max(6, options.cell * 0.26) });
  if (options.layer !== 'codes') {
    paint.setColor(Skia.Color('#ffffff'));
    canvas.drawRect(Skia.XYWHRect(0, 0, pattern.metadata.width * options.cell, pattern.metadata.height * options.cell), paint);
  }
  for (let row = 0; row < pattern.metadata.height; row++) {
    for (let col = 0; col < pattern.metadata.width; col++) {
      const item = pattern.cells[row][col];
      const color = colors.get(item.colorId);
      if (!color || item.isEmpty) continue;
      const muted = options.selected.length > 0 && !options.selected.includes(item.colorId);
      if (options.layer !== 'codes') {
        paint.setStyle(PaintStyle.Fill);
        paint.setColor(Skia.Color(muted ? '#edf0ed' : color.hex));
        if (completed.has(`${row},${col}`)) paint.setColor(Skia.Color('#b4c2b9'));
        canvas.drawRect(Skia.XYWHRect(col * options.cell, row * options.cell, options.cell, options.cell), paint);
      }
      if (options.layer !== 'chart' && options.codes && options.cell >= 18 && !muted) {
        paint.setColor(Skia.Color(color.rgb[0] * 0.299 + color.rgb[1] * 0.587 + color.rgb[2] * 0.114 > 145 ? '#17241c' : '#ffffff'));
        const label = completed.has(`${row},${col}`) ? '+' : color.code;
        canvas.drawText(label, col * options.cell + (options.cell - font.measureText(label).width) / 2,
          (row + 0.6) * options.cell, paint, font);
      }
    }
  }
  if (options.layer === 'codes' || options.grid === false) return;
  paint.setStyle(PaintStyle.Stroke);
  for (let row = 0; row <= pattern.metadata.height; row++) {
    paint.setColor(Skia.Color(row % 5 === 0 ? '#4b5b50' : '#aeb8b0'));
    paint.setStrokeWidth(row % 5 === 0 ? 1 : 0.35);
    canvas.drawLine(0, row * options.cell, pattern.metadata.width * options.cell, row * options.cell, paint);
  }
  for (let col = 0; col <= pattern.metadata.width; col++) {
    paint.setColor(Skia.Color(col % 5 === 0 ? '#4b5b50' : '#aeb8b0'));
    paint.setStrokeWidth(col % 5 === 0 ? 1 : 0.35);
    canvas.drawLine(col * options.cell, 0, col * options.cell, pattern.metadata.height * options.cell, paint);
  }
}

// 生成包含全量色号、网格与用量图例的 PNG，限制边长避免大图耗尽内存。
export function chartPng(pattern: BeadPattern, palette: CompiledBeadColor[], display: { grid?: boolean; codes?: boolean } = {}) {
  const cell = Math.min(32, Math.floor(4096 / Math.max(pattern.metadata.width, pattern.metadata.height)));
  const usage = calculateUsage(pattern, palette);
  const width = Math.max(pattern.metadata.width * cell, 520);
  const height = pattern.metadata.height * cell + 80 + Math.ceil(usage.length / 4) * 30;
  const surface = Skia.Surface.MakeOffscreen(width, height);
  if (!surface) throw new Error('图片过大，无法分配绘图内存，请减少图纸尺寸。');
  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color('#ffffff'));
  drawChart(canvas, pattern, palette, { cell, codes: display.codes ?? true, grid: display.grid, selected: [], completed: [] });
  const font = matchFont({ fontFamily: 'sans-serif', fontSize: 15 });
  const paint = Skia.Paint();
  paint.setColor(Skia.Color('#17241c'));
  canvas.drawText(`Pindo | ${pattern.metadata.width} x ${pattern.metadata.height} | ${usage.reduce((sum, item) => sum + item.count, 0)}`,
    12, pattern.metadata.height * cell + 28, paint, font);
  usage.forEach((item, index) => {
    const x = index % 4 * (width / 4) + 12;
    const y = pattern.metadata.height * cell + 65 + Math.floor(index / 4) * 30;
    paint.setColor(Skia.Color(item.color.hex));
    canvas.drawRect(Skia.XYWHRect(x, y - 14, 18, 18), paint);
    paint.setColor(Skia.Color('#17241c'));
    canvas.drawText(`${item.color.code} x ${item.count}`, x + 24, y, paint, font);
  });
  surface.flush();
  const snapshot = surface.makeImageSnapshot();
  const result = snapshot.encodeToBase64(ImageFormat.PNG);
  snapshot.dispose();
  surface.dispose();
  return result;
}
