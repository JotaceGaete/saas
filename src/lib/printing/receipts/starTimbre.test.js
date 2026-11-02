// FISCAL-80MM-STAR — la boleta completa, tal como sale hacia la Star
// TSP100/TSP143 por el Print Connector: sin GS v 0, bytes aceptados por el
// validador del conector y un timbre que, reconstruido desde los bytes
// ESC * 33 / ESC $, se decodifica al TED exacto.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import {
  RGBLuminanceSource, BinaryBitmap, HybridBinarizer, PDF417Reader, DecodeHintType,
} from '@zxing/library';
import {
  buildBoletaReceipt, buildTimbreImage, resolveTimbreStrategyId, STAR_TIMBRE_X_DOTS, TIMBRE_STRATEGIES,
  MANUAL_TIMBRE_STRATEGY_IDS,
} from './buildBoletaReceipt';
import { renderEscPosReceipt } from './renderEscPosReceipt';
import { buildStarSafe24DotImageCommand } from './escPosImage';
import { decodeDteBytes, parseDteXml } from '../../fiscal/dte/parseDteXml';
import { verifyTedSignature } from '../../fiscal/dte/verifyTed';
import { buildSyntheticDteXml } from '../../fiscal/dte/__fixtures__/syntheticDte';

const STAR_QUEUE = 'Star TSP100 Cutter (TSP143)';
// Límite físico de imágenes posicionadas en la Star (PRINT-4-BUG10/11):
// x=420 completo, x=440 ya cortado. Nada del timbre puede pasar de aquí.
const STAR_IMAGE_RIGHT_LIMIT_DOTS = 440;

// Copia en JS de tools/walinka-print-connector/EscPosStreamValidator.cs.
function validateLikeConnector(data) {
  if (data.length > 256 * 1024) return 'too-large';
  if (data[0] !== 0x1b || data[1] !== 0x40) return 'no-init';
  let i = 0;
  while (i < data.length) {
    const b = data[i];
    if (b === 0x0a || (b >= 0x20 && b <= 0x7e) || b >= 0x80) { i++; continue; }
    if (b === 0x1b) {
      const c = data[i + 1];
      if (c === 0x40 || c === 0x32) { i += 2; continue; }
      if (c === 0x70) return 'drawer';
      if (c === 0x61) { if (data[i + 2] > 2) return 'bad-param'; i += 3; continue; }
      if (c === 0x45) { if (data[i + 2] > 1) return 'bad-param'; i += 3; continue; }
      if (c === 0x33 || c === 0x64) { i += 3; continue; }
      if (c === 0x24) { i += 4; continue; }
      if (c === 0x2a) {
        const m = data[i + 2];
        const per = (m === 0 || m === 1) ? 1 : (m === 0x20 || m === 0x21) ? 3 : -1;
        if (per < 0) return 'bad-param';
        const cols = data[i + 3] | (data[i + 4] << 8);
        if (i + 5 + cols * per > data.length) return 'truncated';
        i += 5 + cols * per; continue;
      }
      return `unknown ESC ${c}`;
    }
    if (b === 0x1d) {
      const c = data[i + 1];
      if (c === 0x21) { i += 3; continue; }
      if (c === 0x56) { const m = data[i + 2]; i += (m === 0x41 || m === 0x42) ? 4 : 3; continue; }
      if (c === 0x76) return 'gs-v-0'; // válido para el conector, pero prohibido para la Star
      return `unknown GS ${c}`;
    }
    return `control ${b}`;
  }
  return null;
}

// Reconstruye el bitmap que la Star dibujaría con ESC $ + ESC * 33: cada
// franja ocupa 24 dots físicos y empieza en la x de ESC $.
function rasterizeStarImage(bytes) {
  const bands = [];
  let x = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0x1b && bytes[i + 1] === 0x24) { x = bytes[i + 2] | (bytes[i + 3] << 8); i += 3; continue; }
    if (bytes[i] === 0x1b && bytes[i + 1] === 0x2a && bytes[i + 2] === 0x21) {
      const cols = bytes[i + 3] | (bytes[i + 4] << 8);
      bands.push({ x, cols, data: bytes.slice(i + 5, i + 5 + cols * 3) });
      i += 4 + cols * 3;
    }
  }
  const width = Math.max(...bands.map((band) => band.x + band.cols)) + 20;
  const height = bands.length * 24 + 20;
  const lum = new Uint8ClampedArray(width * height).fill(255);
  bands.forEach((band, n) => {
    for (let c = 0; c < band.cols; c++) {
      for (let k = 0; k < 3; k++) {
        const v = band.data[c * 3 + k];
        for (let bit = 0; bit < 8; bit++) {
          if (v & (0x80 >> bit)) lum[(10 + n * 24 + k * 8 + bit) * width + band.x + c] = 0;
        }
      }
    }
  });
  return { lum, width, height, bands };
}

function decodePdf417({ lum, width, height }) {
  const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(lum, width, height)));
  return new PDF417Reader().decode(bitmap, new Map([[DecodeHintType.CHARACTER_SET, 'ISO-8859-1']])).getText();
}

function hasGsV0(bytes) {
  return bytes.some((b, i) => b === 0x1d && bytes[i + 1] === 0x76);
}

async function starTicket(dte) {
  const timbreStrategyId = resolveTimbreStrategyId({ printerName: STAR_QUEUE, imageMode: 'bitImageEscStar' });
  const { receipt, timbre } = await buildBoletaReceipt({
    dte, tedVerified: true, resolucion: { numero: '', anio: '' }, reprint: true, timbreStrategyId,
  });
  return { bytes: await renderEscPosReceipt(receipt), timbre, receipt };
}

describe('resolveTimbreStrategyId', () => {
  it('elige el modo Star para la cola de la TSP100/TSP143 y nunca GS v 0', () => {
    for (const name of [STAR_QUEUE, 'Star TSP143IIIU', 'STAR TSP100IIU (Copiar 1)', 'TSP143 (STR_T-001)']) {
      expect(resolveTimbreStrategyId({ printerName: name, imageMode: 'rasterGsV0' })).toBe('starTsp100');
    }
  });

  it('mantiene GS v 0 para otras impresoras y respeta una elección manual', () => {
    expect(resolveTimbreStrategyId({ printerName: 'XP-80C', imageMode: 'bitImageEscStar' })).toBe('rasterGsV0');
    expect(resolveTimbreStrategyId({ printerName: 'XP-80C' }, 'rasterGsV0Narrow')).toBe('rasterGsV0Narrow');
    expect(resolveTimbreStrategyId({ printerName: STAR_QUEUE }, 'auto')).toBe('starTsp100');
    expect(resolveTimbreStrategyId({ printerName: STAR_QUEUE }, 'inexistente')).toBe('starTsp100');
  });

  it('el modo Star está primero en el selector manual y cumple > 200 dpi', () => {
    expect(MANUAL_TIMBRE_STRATEGY_IDS[0]).toBe('starTsp100');
    expect(TIMBRE_STRATEGIES.starTsp100.meetsSiiResolution).toBe(true);
  });
});

describe('buildStarSafe24DotImageCommand', () => {
  it('ESC 3 8, y por franja ESC $ x + ESC * 33 nL nH + LF; ESC 2 al final', () => {
    const width = 300;
    const bits = new Uint8Array(width * 30);
    bits[0] = 1;
    const cmd = buildStarSafe24DotImageCommand(bits, width, 30, { xDots: 16 });
    expect(Array.from(cmd.slice(0, 3))).toEqual([0x1b, 0x33, 8]);
    expect(Array.from(cmd.slice(3, 12))).toEqual([0x1b, 0x24, 16, 0, 0x1b, 0x2a, 0x21, 300 & 0xff, 1]);
    expect(cmd[12]).toBe(0x80);
    const band = 4 + 5 + width * 3 + 1;
    expect(Array.from(cmd.slice(3 + band, 3 + band + 4))).toEqual([0x1b, 0x24, 16, 0]);
    expect(cmd.length).toBe(3 + 2 * band + 2);
    expect(Array.from(cmd.slice(-2))).toEqual([0x1b, 0x32]);
  });
});

describe('boleta completa hacia la Star', () => {
  const dte = parseDteXml(buildSyntheticDteXml());

  it('sin GS v 0, aceptada por el validador del conector y con el timbre legible', async () => {
    const { bytes, timbre } = await starTicket(dte);
    expect(hasGsV0(bytes)).toBe(false);
    expect(validateLikeConnector(bytes)).toBeNull();
    expect(timbre).toMatchObject({ strategyId: 'starTsp100', meetsSiiResolution: true, withinSiiSize: true });
    const image = rasterizeStarImage(bytes);
    expect(Math.max(...image.bands.map((b) => b.x + b.cols))).toBeLessThanOrEqual(STAR_IMAGE_RIGHT_LIMIT_DOTS);
    expect(image.bands.every((b) => b.x === STAR_TIMBRE_X_DOTS)).toBe(true);
    expect(decodePdf417(image)).toBe(dte.ted.xml);
  });

  it('se rotula como reimpresión y no inventa la resolución', async () => {
    const { bytes } = await starTicket(dte);
    const text = Array.from(bytes, (b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : b === 0x0a ? '\n' : '')).join('');
    expect(text).toContain('REIMPRESION');
    expect(text).toContain('Res. SII: por confirmar');
    expect(text).toContain('NO ES NUEVA');
    // El timbre se imprime alineado a la izquierda: la posición viene de ESC $.
    const timbreStart = bytes.findIndex((b, i) => b === 0x1b && bytes[i + 1] === 0x33 && bytes[i + 2] === 8);
    expect(Array.from(bytes.slice(timbreStart - 3, timbreStart))).toEqual([0x1b, 0x61, 0x00]);
  });

  it('una boleta nueva (no reimpresión) sigue exigiendo la resolución', async () => {
    await expect(buildBoletaReceipt({ dte, tedVerified: true, resolucion: null, timbreStrategyId: 'starTsp100' }))
      .rejects.toMatchObject({ code: 'RESOLUCION_REQUIRED' });
    await expect(buildBoletaReceipt({ dte, tedVerified: true, reprint: true, resolucion: { numero: '80', anio: '' } }))
      .rejects.toMatchObject({ code: 'RESOLUCION_REQUIRED' });
  });

  it('el timbre Star mide dentro de los límites del SII (45-90 x 20-40 mm)', async () => {
    const t = await buildTimbreImage(dte.ted.xml, 'starTsp100');
    expect(t.widthDots).toBe(410);
    expect(t.widthMm).toBeGreaterThanOrEqual(45);
    expect(t.heightMm).toBeLessThanOrEqual(40);
  });
});

// Opcional: con el XML real de la boleta 51106 (no versionado), p. ej.
// FISCAL_XML_51106=/ruta/DTE_39_51106.xml npx vitest run starTimbre
const realXmlPath = process.env.FISCAL_XML_51106;
describe.skipIf(!realXmlPath || !existsSync(realXmlPath))('boleta real 51106 hacia la Star', () => {
  it('firma del TED válida, ticket sin GS v 0 y timbre decodificado al TED exacto', async () => {
    const dte = parseDteXml(decodeDteBytes(readFileSync(realXmlPath)));
    expect(dte.folio).toBe(51106);
    expect(await verifyTedSignature(dte.ted)).toBe(true);
    const { bytes, timbre } = await starTicket(dte);
    expect(hasGsV0(bytes)).toBe(false);
    expect(validateLikeConnector(bytes)).toBeNull();
    expect(timbre.withinSiiSize).toBe(true);
    expect(decodePdf417(rasterizeStarImage(bytes))).toBe(dte.ted.xml);
    // eslint-disable-next-line no-console
    console.log(`51106 -> ${bytes.length} bytes, timbre ${timbre.widthMm} x ${timbre.heightMm} mm, ${timbre.rows} filas`);
  });
});
