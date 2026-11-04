import { describe, it, expect } from 'vitest';
import {
  RGBLuminanceSource, BinaryBitmap, HybridBinarizer, PDF417Reader, DecodeHintType,
} from '@zxing/library';
import { encodeTedPdf417, scalePdf417, TedBarcodeError } from './tedPdf417';
import { parseDteXml } from './parseDteXml';
import { buildSyntheticDteXml } from './__fixtures__/syntheticDte';

// Decodifica la imagen escalada con un lector PDF417 independiente (ZXing):
// la prueba es "lo que se imprimiría se lee como el TED exacto".
function decode({ bits, width, height }) {
  const pad = 10;
  const W = width + 2 * pad;
  const H = height + 2 * pad;
  const lum = new Uint8ClampedArray(W * H).fill(255);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) if (bits[y * width + x]) lum[(y + pad) * W + x + pad] = 0;
  }
  const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(lum, W, H)));
  const hints = new Map([[DecodeHintType.CHARACTER_SET, 'ISO-8859-1']]);
  return new PDF417Reader().decode(bitmap, hints).getText();
}

describe('encodeTedPdf417', () => {
  it('codifica el TED completo y se decodifica idéntico, con eñes', async () => {
    const { ted } = parseDteXml(buildSyntheticDteXml());
    const symbol = await encodeTedPdf417(ted.xml);
    expect(symbol.modules.every((v) => v === 0 || v === 1)).toBe(true);
    const scaled = scalePdf417(symbol, { moduleWidthDots: 2, rowHeightDots: 5, quietZoneDots: 4 });
    expect(decode(scaled)).toBe(ted.xml);
  });

  it('usa 12 columnas de datos: 273 módulos de ancho', async () => {
    const { ted } = parseDteXml(buildSyntheticDteXml());
    const symbol = await encodeTedPdf417(ted.xml);
    expect(symbol.widthModules).toBe(17 * 12 + 69);
  });

  it('se sigue leyendo con la escala de baja densidad (1 x 2 dots)', async () => {
    const { ted } = parseDteXml(buildSyntheticDteXml());
    const scaled = scalePdf417(await encodeTedPdf417(ted.xml), { moduleWidthDots: 1, rowHeightDots: 2 });
    expect(decode(scaled)).toBe(ted.xml);
  });

  it('rechaza textos que no son un TED o que no son ISO-8859-1', async () => {
    await expect(encodeTedPdf417('hola')).rejects.toBeInstanceOf(TedBarcodeError);
    await expect(encodeTedPdf417('<TED>€</TED>')).rejects.toMatchObject({ code: 'TED_NOT_LATIN1' });
  });
});

describe('scalePdf417', () => {
  it('escala cada módulo a X por Y dots y agrega zona de silencio', () => {
    const symbol = { modules: Uint8Array.from([1, 0, 0, 1]), widthModules: 2, rows: 2 };
    const { bits, width, height } = scalePdf417(symbol, { moduleWidthDots: 2, rowHeightDots: 3, quietZoneDots: 1 });
    expect([width, height]).toEqual([6, 8]);
    const row = (y) => Array.from(bits.slice(y * width, (y + 1) * width)).join('');
    expect(row(0)).toBe('000000');
    expect(row(1)).toBe('011000');
    expect(row(3)).toBe('011000');
    expect(row(4)).toBe('000110');
    expect(row(7)).toBe('000000');
  });

  it('rechaza escalas inválidas', () => {
    expect(() => scalePdf417({ modules: new Uint8Array(1), widthModules: 1, rows: 1 }, { moduleWidthDots: 0, rowHeightDots: 1 }))
      .toThrow(TedBarcodeError);
  });
});
