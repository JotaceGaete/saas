import { describe, it, expect } from 'vitest';
import {
  buildBoletaReceipt, buildTimbreDiagnosticReceipt, buildTimbreImage, formatRut, formatFechaEmision,
  BoletaReceiptError, TIMBRE_STRATEGIES, SELECTABLE_TIMBRE_STRATEGY_IDS,
} from './buildBoletaReceipt';
import { renderEscPosReceipt } from './renderEscPosReceipt';
import { buildDoubleDensity24BitImageCommand } from './escPosImage';
import { parseDteXml } from '../../fiscal/dte/parseDteXml';
import { buildSyntheticDteXml } from '../../fiscal/dte/__fixtures__/syntheticDte';

const dte = parseDteXml(buildSyntheticDteXml());
const base = { dte, tedVerified: true, resolucion: { numero: 80, anio: 2014 } };

function asText(bytes) {
  return Array.from(bytes, (b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : b === 0x0a ? '\n' : '')).join('');
}

describe('formatos', () => {
  it('formatea RUT y fecha', () => {
    expect(formatRut('77804207-k')).toBe('77.804.207-K');
    expect(formatRut('1111111-1')).toBe('1.111.111-1');
    expect(formatFechaEmision('2026-10-31')).toBe('31-10-2026');
  });
});

describe('buildBoletaReceipt', () => {
  it('formato tipo boleta impresa: logo, recuadro del documento, tabla y totales en recuadro', async () => {
    const { receipt } = await buildBoletaReceipt({
      ...base, resolucion: { numero: 80, anio: 2014, fecha: '2014-08-22' },
      nombreFantasia: 'Artesellos', logoUrl: 'https://x/logo.png', imageMode: 'rasterGsV0',
      telefono: '9 1234 5678', formaPago: 'Efectivo',
    });
    expect(receipt.lines[0]).toEqual({ type: 'logo', url: 'https://x/logo.png' });
    expect(receipt.imageMode).toBe('rasterGsV0');
    const boxes = receipt.lines.filter((l) => l.type === 'box');
    expect(boxes[0].rows.map((r) => r.text)).toEqual(['RUT 11.111.111-1', 'BOLETA ELECTRONICA', 'Nro. 1201']);
    expect(boxes[1].rows.map((r) => r.left)).toEqual(['NETO:', 'IVA (19%):', 'Total Exento:', 'TOTAL:']);
    const texts = receipt.lines.filter((l) => l.type === 'text').map((l) => l.text);
    expect(texts).toContain('Res. 80 del 22-08-2014');
    expect(receipt.lines).toEqual(expect.arrayContaining([
      { type: 'field', label: 'Fono:', value: '9 1234 5678' },
      { type: 'field', label: 'Forma de pago:', value: 'EFECTIVO' },
    ]));
    // Sin printLogo no hay logo; sin logoUrl tampoco.
    const off = await buildBoletaReceipt({ ...base, logoUrl: 'https://x/logo.png', printLogo: false });
    expect(off.receipt.lines.some((l) => l.type === 'logo')).toBe(false);
    const none = await buildBoletaReceipt(base);
    expect(none.receipt.lines.some((l) => l.type === 'logo')).toBe(false);
    // Recuadro solo con ASCII: ningún byte >= 0x80 fuera del timbre (en modo chino
    // de la XP-80C los caracteres de línea salían como letras chinas).
    const noTimbre = { ...none.receipt, lines: none.receipt.lines.filter((l) => l.type !== 'rasterBytes') };
    const bytes = Array.from(await renderEscPosReceipt(noTimbre));
    expect(bytes.some((b) => b >= 0x80)).toBe(false);
    const text = asText(bytes);
    expect(text).toContain('+----');
    expect(text).toContain('|      RUT 11.111.111-1      |');
    expect(text).toContain('CANT ITEM');
    expect(text).toContain('SUBTOTAL');
    expect(text).toContain('Comuna:    Coronel');
  });

  it('arma la representación con los datos del XML y las leyendas del timbre', async () => {
    const { receipt, timbre } = await buildBoletaReceipt({ ...base, unidadSii: 'Concepción', nombreFantasia: 'Bonita' });
    const texts = receipt.lines.filter((l) => l.type === 'text').map((l) => l.text);
    expect(texts).toEqual(expect.arrayContaining([
      'COMERCIAL NANDU SPA', 'VENTA AL POR MENOR', 'S.I.I. - CONCEPCION',
      'Timbre Electronico S.I.I.', 'Res. 80 de 2014', 'Verifique documento: www.sii.cl',
    ]));
    expect(receipt.lines).toEqual(expect.arrayContaining([
      { type: 'field', label: 'Direccion:', value: 'Calle Falsa 123' },
      { type: 'field', label: 'Comuna:', value: 'Coronel' },
      { type: 'field', label: 'Fecha:', value: '01/11/2026' },
    ]));
    const boxes = receipt.lines.filter((l) => l.type === 'box');
    expect(boxes[0].rows.map((r) => r.text)).toEqual(['RUT 11.111.111-1', 'BOLETA ELECTRONICA', 'Nro. 1201']);
    expect(boxes[1].rows).toEqual([
      { left: 'NETO:', amount: 1000, bold: true },
      { left: 'IVA (19%):', amount: 190, bold: true },
      { left: 'Total Exento:', amount: 0 },
      { left: 'TOTAL:', amount: 1190, bold: true },
    ]);
    expect(receipt.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'boletaItem', name: 'Cafe con leche', qty: 1, unitPrice: 1190, lineTotal: 1190 }),
    ]));
    // Las leyendas van inmediatamente bajo el timbre.
    const timbreIndex = receipt.lines.findIndex((l) => l.type === 'rasterBytes');
    expect(receipt.lines[timbreIndex + 1].text).toBe('Timbre Electronico S.I.I.');
    expect(timbre).toMatchObject({ strategyId: 'rasterGsV0', meetsSiiResolution: true, withinSiiSize: true, columns: 273 });
  });

  it('el ticket renderizado contiene los textos y el timbre como GS v 0', async () => {
    const { receipt } = await buildBoletaReceipt(base);
    const bytes = await renderEscPosReceipt(receipt);
    const text = asText(bytes);
    expect(text).toContain('BOLETA ELECTRONICA');
    expect(text).toContain('Res. 80 de 2014');
    const gsv0 = bytes.findIndex((b, i) => b === 0x1d && bytes[i + 1] === 0x76 && bytes[i + 2] === 0x30);
    expect(gsv0).toBeGreaterThan(0);
    expect(bytes.length).toBeLessThan(256 * 1024); // límite del Print Connector
  });

  it('la reimpresión se rotula arriba y abajo como copia de un documento existente', async () => {
    const { receipt } = await buildBoletaReceipt({ ...base, reprint: true });
    const texts = receipt.lines.filter((l) => l.type === 'text').map((l) => l.text);
    expect(texts.slice(0, 3)).toEqual(['REIMPRESION', 'Documento emitido el 01-11-2026', 'No corresponde a una nueva emision']);
    expect(texts.at(-1)).toBe('REIMPRESION BOLETA 1201 - NO ES NUEVA EMISION');
    const { receipt: plain } = await buildBoletaReceipt(base);
    expect(plain.lines.some((l) => /REIMPRESION/.test(l.text || ''))).toBe(false);
  });

  it('lleva el número interno de la venta al pie, también en la reimpresión', async () => {
    const last = async (extra) => (await buildBoletaReceipt({ ...base, ...extra })).receipt.lines.filter((l) => l.type === 'text').at(-1).text;
    expect(await last({ saleNumber: 12 })).toBe('Ref. interna NV-0012');
    expect(await last({ saleNumber: 12, reprint: true })).toBe('Ref. interna NV-0012');
    expect(await last({ saleNumber: 'NV-0012' })).toBe('Ref. interna NV-0012');
    const { receipt } = await buildBoletaReceipt(base);
    expect(receipt.lines.some((l) => /Ref\. interna/.test(l.text || ''))).toBe(false);
  });

  it('no imprime sin timbre verificado, sin resolución o con otro tipo de documento', async () => {
    await expect(buildBoletaReceipt({ ...base, tedVerified: false })).rejects.toMatchObject({ code: 'TED_NOT_VERIFIED' });
    await expect(buildBoletaReceipt({ ...base, resolucion: null })).rejects.toMatchObject({ code: 'RESOLUCION_REQUIRED' });
    await expect(buildBoletaReceipt({ ...base, resolucion: { numero: 'x', anio: 2014 } })).rejects.toMatchObject({ code: 'RESOLUCION_REQUIRED' });
    await expect(buildBoletaReceipt({ ...base, dte: { ...dte, tipoDte: 33 } })).rejects.toBeInstanceOf(BoletaReceiptError);
    await expect(buildBoletaReceipt({ ...base, paperWidthMm: 58 })).rejects.toMatchObject({ code: 'PAPER_WIDTH_UNSUPPORTED' });
    await expect(buildBoletaReceipt({ ...base, timbreStrategyId: 'otro' })).rejects.toMatchObject({ code: 'TIMBRE_STRATEGY_INVALID' });
  });
});

describe('buildTimbreImage', () => {
  it('a 203 dpi el timbre mide ~68 mm de ancho y cumple los límites del SII', async () => {
    const t = await buildTimbreImage(dte.ted.xml, 'escStar24');
    expect(t.widthDots).toBe(546);
    expect(t.widthMm).toBeCloseTo(68.3, 0);
    expect(t.heightMm).toBeGreaterThanOrEqual(20);
    expect(t.heightMm).toBeLessThanOrEqual(40);
    expect(t.withinSiiSize).toBe(true);
  });

  it('la estrategia de baja densidad queda marcada como no conforme', async () => {
    const t = await buildTimbreImage(dte.ted.xml, 'escStar8');
    expect(t.meetsSiiResolution).toBe(false);
    expect(TIMBRE_STRATEGIES.escStar8.meetsSiiResolution).toBe(false);
  });
});

describe('variante angosta', () => {
  it('con 10 columnas cabe en un cabezal de 512 dots y sigue dentro de los límites del SII', async () => {
    const t = await buildTimbreImage(dte.ted.xml, 'rasterGsV0Narrow');
    expect(t.widthDots).toBeLessThanOrEqual(512 - 32);
    expect(t.widthMm).toBeGreaterThanOrEqual(45);
    expect(t.withinSiiSize).toBe(true);
    expect(t.meetsSiiResolution).toBe(true);
  });

  it('las variantes ofrecidas al usuario cumplen todas > 200 dpi', () => {
    expect(SELECTABLE_TIMBRE_STRATEGY_IDS.every((id) => TIMBRE_STRATEGIES[id].meetsSiiResolution)).toBe(true);
  });
});

describe('buildDoubleDensity24BitImageCommand', () => {
  it('emite ESC 3 24, una franja ESC * 33 con ancho de 2 bytes y 3 bytes por columna', () => {
    const width = 300;
    const height = 30;
    const bits = new Uint8Array(width * height);
    bits[0] = 1; // (0,0) -> MSB del primer byte
    bits[25 * width + 299] = 1; // (299,25) -> segunda franja, byte 0, bit 1
    const cmd = buildDoubleDensity24BitImageCommand(bits, width, height);
    expect(Array.from(cmd.slice(0, 3))).toEqual([0x1b, 0x33, 24]);
    expect(Array.from(cmd.slice(3, 8))).toEqual([0x1b, 0x2a, 0x21, 300 & 0xff, 300 >> 8]);
    expect(cmd[8]).toBe(0x80);
    const band1 = 3 + 5 + width * 3 + 1;
    expect(Array.from(cmd.slice(band1, band1 + 5))).toEqual([0x1b, 0x2a, 0x21, 300 & 0xff, 300 >> 8]);
    expect(cmd[band1 + 5 + 299 * 3]).toBe(0x40);
    expect(cmd.length).toBe(3 + 2 * (5 + width * 3 + 1) + 2);
    expect(Array.from(cmd.slice(-2))).toEqual([0x1b, 0x32]);
  });
});

describe('buildTimbreDiagnosticReceipt', () => {
  it('imprime el mismo timbre en las tres estrategias, rotuladas y sin valor tributario', async () => {
    const { receipt, timbres } = await buildTimbreDiagnosticReceipt({ dte, tedVerified: true });
    expect(timbres.map((t) => t.strategyId)).toEqual(['rasterGsV0', 'escStar24', 'rasterGsV0Narrow']);
    expect(receipt.lines[2].text).toBe('Reimpresion del timbre de la boleta 1201');
    expect(receipt.lines.filter((l) => l.type === 'rasterBytes')).toHaveLength(3);
    expect(receipt.lines[1].text).toBe('SIN VALOR TRIBUTARIO');
    const bytes = await renderEscPosReceipt(receipt);
    expect(bytes.length).toBeLessThan(256 * 1024);
    await expect(buildTimbreDiagnosticReceipt({ dte, tedVerified: false })).rejects.toMatchObject({ code: 'TED_NOT_VERIFIED' });
  });
});
