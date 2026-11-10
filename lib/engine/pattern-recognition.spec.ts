// 本文件验证原生像素识别在无浏览器环境中的网格切分与颜色还原。
import { describe, expect, it } from 'vitest';
import { recognizePatternFromPixels } from './pattern-recognition';
import type { CompiledBeadColor } from '../types/bead';

const palette: CompiledBeadColor[] = [
  { id: 'black', brand: 'mard', code: 'B1', name: '黑色', hex: '#000000', rgb: [0, 0, 0], lab: [0, 0, 0], source: '', license: '' },
  { id: 'white', brand: 'mard', code: 'W1', name: '白色', hex: '#ffffff', rgb: [255, 255, 255], lab: [100, 0, 0], source: '', license: '' },
];

describe('原生像素图纸识别', () => {
  it('不依赖 document 或 ImageData 构造器即可还原黑白格子', () => {
    const data = new Uint8ClampedArray(40 * 40 * 4);
    for (let row = 0; row < 40; row++) {
      for (let col = 0; col < 40; col++) {
        const value = (row < 20) === (col < 20) ? 0 : 255;
        data.set([value, value, value, 255], (row * 40 + col) * 4);
      }
    }
    const result = recognizePatternFromPixels({ width: 40, height: 40, data }, { brand: 'mard', width: 2, height: 2, palette, preferAutoGrid: false });
    expect(result.pattern.cells.map(row => row.map(cell => cell.colorId))).toEqual([['black', 'white'], ['white', 'black']]);
    expect(result.pattern.metadata.width).toBe(2);
  });

  it('拒绝空色板，避免原生画布收到无效颜色', () => {
    expect(() => recognizePatternFromPixels({ width: 1, height: 1, data: new Uint8ClampedArray(4) }, { brand: 'mard', width: 1, height: 1, palette: [] })).toThrow('当前色板为空');
  });
});
