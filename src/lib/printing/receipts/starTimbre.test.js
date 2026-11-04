// FISCAL-80MM-STAR — la boleta completa, tal como sale hacia la Star
// TSP100/TSP143 por el Print Connector: sin GS v 0, bytes aceptados por el
// validador del conector y un timbre que, reconstruido desde los bytes
// ESC * 33 / ESC $, se decodifica al TED exacto.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import {
  validateLikeConnector, rasterizeStarImage, decodePdf417, hasGsV0,
} from './__testUtils__/starConnectorHarness';
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

async function starTicket(dte, requested) {
  const timbreStrategyId = resolveTimbreStrategyId({ printerName: STAR_QUEUE, imageMode: 'bitImageEscStar' }, requested);
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
    expect(MANUAL_TIMBRE_STRATEGY_IDS[1]).toBe('starTsp100Double');
    expect(TIMBRE_STRATEGIES.starTsp100.meetsSiiResolution).toBe(true);
  });
});

describe('buildStarSafe24DotImageCommand', () => {
  it('ESC 3 8, y por franja ESC $ x + ESC * 32 nL nH + LF; ESC 2 al final', () => {
    const width = 205;
    const bits = new Uint8Array(width * 30);
    bits[0] = 1;
    const cmd = buildStarSafe24DotImageCommand(bits, width, 30, { xDots: 16, density: 'single' });
    expect(Array.from(cmd.slice(0, 3))).toEqual([0x1b, 0x33, 8]);
    expect(Array.from(cmd.slice(3, 12))).toEqual([0x1b, 0x24, 16, 0, 0x1b, 0x2a, 0x20, 205, 0]);
    expect(cmd[12]).toBe(0x80);
    const band = 4 + 5 + width * 3 + 1;
    expect(Array.from(cmd.slice(3 + band, 3 + band + 7))).toEqual([0x1b, 0x24, 16, 0, 0x1b, 0x2a, 0x20]);
    expect(cmd.length).toBe(3 + 2 * band + 2);
    expect(Array.from(cmd.slice(-2))).toEqual([0x1b, 0x32]);
  });

  it('densidad doble usa ESC * 33 y rechaza densidades desconocidas', () => {
    const cmd = buildStarSafe24DotImageCommand(new Uint8Array(300 * 24), 300, 24, { density: 'double' });
    expect(Array.from(cmd.slice(7, 12))).toEqual([0x1b, 0x2a, 0x21, 300 & 0xff, 1]);
    expect(() => buildStarSafe24DotImageCommand(new Uint8Array(8), 8, 1, { density: 'triple' })).toThrow();
  });
});

describe('boleta completa hacia la Star', () => {
  const dte = parseDteXml(buildSyntheticDteXml());

  it('sin GS v 0, con ESC * 32 de 205 columnas (nH = 0), aceptada por el conector y con el timbre legible', async () => {
    const { bytes, timbre } = await starTicket(dte);
    expect(hasGsV0(bytes)).toBe(false);
    expect(validateLikeConnector(bytes)).toBeNull();
    expect(timbre).toMatchObject({ strategyId: 'starTsp100', meetsSiiResolution: true, withinSiiSize: true, widthDots: 410 });
    const image = rasterizeStarImage(bytes);
    expect(image.bands.every((b) => b.m === 0x20 && b.cols === 205 && b.nH === 0)).toBe(true);
    expect(Math.max(...image.bands.map((b) => b.x + b.physicalWidth))).toBeLessThanOrEqual(STAR_IMAGE_RIGHT_LIMIT_DOTS);
    expect(image.bands.every((b) => b.x === STAR_TIMBRE_X_DOTS)).toBe(true);
    expect(decodePdf417(image)).toBe(dte.ted.xml);
  });

  it('ESC * 32 y ESC * 33 dejan el mismo timbre físico, dot por dot', async () => {
    const single = rasterizeStarImage((await starTicket(dte, 'starTsp100')).bytes);
    const double = rasterizeStarImage((await starTicket(dte, 'starTsp100Double')).bytes);
    expect(double.bands.every((b) => b.m === 0x21 && b.cols === 410)).toBe(true);
    expect([single.width, single.height]).toEqual([double.width, double.height]);
    expect(Buffer.from(single.lum).equals(Buffer.from(double.lum))).toBe(true);
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
    const image = rasterizeStarImage(bytes);
    expect(image.bands.every((b) => b.m === 0x20 && b.nH === 0)).toBe(true);
    expect(Math.max(...image.bands.map((b) => b.x + b.physicalWidth))).toBeLessThanOrEqual(STAR_IMAGE_RIGHT_LIMIT_DOTS);
    expect(decodePdf417(image)).toBe(dte.ted.xml);
    // eslint-disable-next-line no-console
    console.log(`51106 -> ${bytes.length} bytes, timbre ${timbre.widthMm} x ${timbre.heightMm} mm, ${timbre.rows} filas`);
  });
});
