// 本文件通过 Skia 绘制图纸与色号，供原生预览和图片导出共用。
import { Skia, matchFont, PaintStyle, ImageFormat, type SkCanvas } from '@shopify/react-native-skia';
import type { BeadPattern, CompiledBeadColor } from '@/lib/types/bead';
import { calculateUsage } from '@/lib/utils/usage-calculator';

export interface DrawOptions { cell: number; codes: boolean; grid?: boolean; mirror?: boolean; coordinates?: boolean; selected: string[]; completed: string[]; layer?: 'chart' | 'codes' }

// 根据格子和当前高亮状态绘制图纸，避免生成数万个原生视图。
export function drawChart(canvas: SkCanvas, pattern: BeadPattern, palette: CompiledBeadColor[], options: DrawOptions) {
  const colors = new Map(palette.map(color => [color.id, color]));
  const completed = new Set(options.completed);
  const paint = Skia.Paint();
  const font = matchFont({ fontFamily: 'sans-serif', fontSize: Math.max(7, options.cell * 0.34) });
  const inset = options.coordinates ? options.cell : 0;
  canvas.save();
  canvas.translate(inset, inset);
  if (options.layer !== 'codes') {
    paint.setColor(Skia.Color('#ffffff'));
    canvas.drawRect(Skia.XYWHRect(0, 0, pattern.metadata.width * options.cell, pattern.metadata.height * options.cell), paint);
  }
  for (let row = 0; row < pattern.metadata.height; row++) {
    for (let col = 0; col < pattern.metadata.width; col++) {
      const item = pattern.cells[row][col];
      const displayCol = options.mirror ? pattern.metadata.width - 1 - col : col;
      const color = colors.get(item.colorId);
      if (!color || item.isEmpty) continue;
      const muted = options.selected.length > 0 && !options.selected.includes(item.colorId);
      if (options.layer !== 'codes') {
        paint.setStyle(PaintStyle.Fill);
        paint.setColor(Skia.Color(muted ? '#edf0ed' : color.hex));
        if (completed.has(`${row},${col}`)) paint.setColor(Skia.Color('#b4c2b9'));
        canvas.drawRect(Skia.XYWHRect(displayCol * options.cell, row * options.cell, options.cell, options.cell), paint);
      }
      if (options.layer !== 'chart' && options.codes && options.cell >= 18 && !muted) {
        paint.setColor(Skia.Color(color.rgb[0] * 0.299 + color.rgb[1] * 0.587 + color.rgb[2] * 0.114 > 145 ? '#17241c' : '#ffffff'));
        const label = completed.has(`${row},${col}`) ? '+' : color.code;
        canvas.drawText(label, displayCol * options.cell + (options.cell - font.measureText(label).width) / 2,
          (row + 0.6) * options.cell, paint, font);
      }
    }
  }
  if (options.layer === 'codes' || options.grid === false) { canvas.restore(); return; }
  paint.setStyle(PaintStyle.Stroke);
  for (let row = 0; row <= pattern.metadata.height; row++) {
    paint.setColor(Skia.Color(row % 10 === 0 ? '#354239' : row % 5 === 0 ? '#657269' : '#aeb8b0'));
    paint.setStrokeWidth(row % 10 === 0 ? 1.4 : row % 5 === 0 ? 0.8 : 0.35);
    canvas.drawLine(0, row * options.cell, pattern.metadata.width * options.cell, row * options.cell, paint);
  }
  for (let col = 0; col <= pattern.metadata.width; col++) {
    paint.setColor(Skia.Color(col % 10 === 0 ? '#354239' : col % 5 === 0 ? '#657269' : '#aeb8b0'));
    paint.setStrokeWidth(col % 10 === 0 ? 1.4 : col % 5 === 0 ? 0.8 : 0.35);
    canvas.drawLine(col * options.cell, 0, col * options.cell, pattern.metadata.height * options.cell, paint);
  }
  if (options.coordinates) drawCoordinates(canvas, pattern, options.cell);
  canvas.restore();
}

// 四边逐格标注坐标，镜像时仅翻转图案，序号和色号仍保持正常阅读方向。
function drawCoordinates(canvas: SkCanvas, pattern: BeadPattern, cell: number) {
  const paint = Skia.Paint();
  const font = matchFont({ fontFamily: 'sans-serif', fontSize: cell * 0.4, fontWeight: '600' });
  const width = pattern.metadata.width * cell;
  const height = pattern.metadata.height * cell;
  paint.setColor(Skia.Color('#ffffff'));
  canvas.drawRect(Skia.XYWHRect(-cell, -cell, width + cell * 2, cell), paint);
  canvas.drawRect(Skia.XYWHRect(-cell, height, width + cell * 2, cell), paint);
  canvas.drawRect(Skia.XYWHRect(-cell, 0, cell, height), paint);
  canvas.drawRect(Skia.XYWHRect(width, 0, cell, height), paint);
  paint.setColor(Skia.Color('#17241c'));
  for (let col = 0; col < pattern.metadata.width; col++) {
    const label = String(col + 1);
    const x = (col + 0.5) * cell - font.measureText(label).width / 2;
    canvas.drawText(label, x, -cell * 0.28, paint, font);
    canvas.drawText(label, x, height + cell * 0.65, paint, font);
  }
  for (let row = 0; row < pattern.metadata.height; row++) {
    const label = String(row + 1);
    const labelWidth = font.measureText(label).width;
    const y = (row + 0.64) * cell;
    canvas.drawText(label, -cell * 0.5 - labelWidth / 2, y, paint, font);
    canvas.drawText(label, width + cell * 0.5 - labelWidth / 2, y, paint, font);
  }
}

// 生成包含全量色号、网格与用量图例的 PNG，限制边长避免大图耗尽内存。
export function chartPng(pattern: BeadPattern, palette: CompiledBeadColor[], display: { grid?: boolean; codes?: boolean; mirror?: boolean } = {}) {
  const cell = Math.min(32, Math.floor(4096 / (Math.max(pattern.metadata.width, pattern.metadata.height) + 2)));
  const usage = calculateUsage(pattern, palette, 'code');
  const chartWidth = (pattern.metadata.width + 2) * cell;
  const chartHeight = (pattern.metadata.height + 2) * cell;
  const width = Math.max(chartWidth, 520);
  const columns = Math.max(2, Math.min(6, Math.floor(width / 250)));
  const legendInset = Math.max(24, Math.round(width * 0.03));
  const legendWidth = width - legendInset * 2;
  const legendColumnWidth = legendWidth / columns;
  const chartTop = 68;
  const legendTop = chartTop + chartHeight + 30;
  const legendRowHeight = 76;
  const height = legendTop + Math.ceil(usage.length / columns) * legendRowHeight + 12;
  const surface = Skia.Surface.MakeOffscreen(width, height);
  if (!surface) throw new Error('图片过大，无法分配绘图内存，请减少图纸尺寸。');
  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color('#ffffff'));
  canvas.save();
  canvas.translate((width - chartWidth) / 2, chartTop);
  drawChart(canvas, pattern, palette, { cell, codes: display.codes ?? true, grid: display.grid, mirror: display.mirror,
    coordinates: true, selected: [], completed: [] });
  canvas.restore();
  const titleFont = matchFont({ fontFamily: 'sans-serif', fontSize: 24, fontWeight: '600' });
  const detailFont = matchFont({ fontFamily: 'sans-serif', fontSize: 20, fontWeight: '600' });
  const countFont = matchFont({ fontFamily: 'sans-serif', fontSize: 16 });
  const paint = Skia.Paint();
  paint.setColor(Skia.Color('#17241c'));
  canvas.drawText(`${pattern.metadata.brand.toUpperCase()} (${usage.reduce((sum, item) => sum + item.count, 0)})${display.mirror ? ' [MIRROR]' : ''}`,
    16, 42, paint, titleFont);
  const dimensions = `${pattern.metadata.width} x ${pattern.metadata.height} | ${usage.length} colors`;
  canvas.drawText(dimensions, width - titleFont.measureText(dimensions).width - 16, 42, paint, titleFont);
  usage.forEach((item, index) => {
    const x = legendInset + index % columns * legendColumnWidth + 5;
    const y = legendTop + Math.floor(index / columns) * legendRowHeight;
    const cardWidth = legendColumnWidth - 10;
    paint.setColor(Skia.Color(item.color.hex));
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(x, y, cardWidth, 64), 5, 5), paint);
    const light = item.color.rgb[0] * 0.299 + item.color.rgb[1] * 0.587 + item.color.rgb[2] * 0.114 > 145;
    paint.setColor(Skia.Color(light ? '#17241c' : '#ffffff'));
    canvas.drawText(item.color.code, x + 12, y + 27, paint, detailFont);
    paint.setColor(Skia.Color(light ? '#536057' : '#d9e2dc'));
    canvas.drawText(`×${item.count}`, x + 12, y + 50, paint, countFont);
  });
  surface.flush();
  const snapshot = surface.makeImageSnapshot();
  const result = snapshot.encodeToBase64(ImageFormat.PNG);
  snapshot.dispose();
  surface.dispose();
  return result;
}
