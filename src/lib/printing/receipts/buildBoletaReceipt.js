// FISCAL-80MM — representación impresa de una boleta electrónica (DTE 39)
// en papel térmico de 80 mm, generada por Walinka a partir del XML auténtico
// emitido por el proveedor (DTE Core).
//
// Reglas:
//  - Todo dato tributario sale del XML ya emitido (parseDteXml). Nada se
//    recalcula ni se toma de la venta del TPV: si el XML dice $100, el
//    ticket dice $100.
//  - No se imprime si el timbre no verifica contra la clave del CAF
//    (verifyTedSignature) o si falta la resolución del SII.
//  - Imprimir o reimprimir nunca llama al proveedor ni cambia el estado
//    fiscal.
//  - El cumplimiento de esta representación con la norma vigente del SII
//    está PENDIENTE de validación (ver docs/fiscal/REPRESENTACION_BOLETA_80MM.md).
//    Hasta entonces se usa solo para pruebas.
//
// Igual que buildSaleReceipt: este builder decide contenido; el formato de
// moneda, el wrap y los comandos ESC/POS son de renderEscPosReceipt.

import { stripDiacritics } from './renderEscPosReceipt';
import { buildRasterCommand, buildTiledColumnBitImageCommand, buildDoubleDensity24BitImageCommand } from './escPosImage';
import {
  encodeTedPdf417, scalePdf417, DOTS_PER_MM_203DPI, SII_TIMBRE_LIMITS_MM,
} from '../../fiscal/dte/tedPdf417';

export class BoletaReceiptError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'BoletaReceiptError';
    this.code = code;
  }
}

// Cómo se imprime el timbre. `dpi` es la resolución física esperada;
// solo las estrategias con `meetsSiiResolution` cumplen el mínimo del SII
// (> 200 dpi). Ninguna está validada todavía en la Star TSP100.
export const TIMBRE_STRATEGIES = Object.freeze({
  rasterGsV0: Object.freeze({
    id: 'rasterGsV0',
    label: 'GS v 0 (raster, 203 dpi)',
    moduleWidthDots: 2,
    rowHeightDots: 5,
    dotsPerMmX: DOTS_PER_MM_203DPI,
    dotsPerMmY: DOTS_PER_MM_203DPI,
    meetsSiiResolution: true,
    build: (bits, width, height) => buildRasterCommand(bits, width, height),
  }),
  escStar24: Object.freeze({
    id: 'escStar24',
    label: 'ESC * 33 (24 dots, 203 dpi)',
    moduleWidthDots: 2,
    rowHeightDots: 5,
    dotsPerMmX: DOTS_PER_MM_203DPI,
    dotsPerMmY: DOTS_PER_MM_203DPI,
    meetsSiiResolution: true,
    build: (bits, width, height) => buildDoubleDensity24BitImageCommand(bits, width, height),
  }),
  // Misma ruta ESC * m=0 validada para el logo en la TSP100: ~101 dpi en
  // horizontal y ~69 dpi en vertical (100 x 100 dots midieron 25 x 37 mm).
  // NO cumple la resolución del SII; queda solo como referencia de lectura.
  escStar8: Object.freeze({
    id: 'escStar8',
    label: 'ESC * 0 (8 dots, ~101 dpi, no cumple SII)',
    moduleWidthDots: 1,
    rowHeightDots: 2,
    dotsPerMmX: 4,
    dotsPerMmY: 100 / 37,
    meetsSiiResolution: false,
    build: (bits, width, height) => buildTiledColumnBitImageCommand(bits, width, height),
  }),
});

export const DEFAULT_TIMBRE_STRATEGY_ID = 'rasterGsV0';

/** "77804207-K" -> "77.804.207-K" */
export function formatRut(rut) {
  const m = /^(\d{1,8})-([\dK])$/i.exec(String(rut || '').trim());
  if (!m) return String(rut || '');
  return `${m[1].replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${m[2].toUpperCase()}`;
}

/** "2026-10-31" -> "31-10-2026" */
export function formatFechaEmision(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(iso || '');
}

function clean(value) {
  return stripDiacritics(String(value ?? '').replace(/\s+/g, ' ').trim());
}

/**
 * Genera el comando ESC/POS del timbre y sus medidas físicas esperadas.
 * @param {string} tedXml
 * @param {string} strategyId
 * @param {Object} [options] - { bwip } inyectable en pruebas
 */
export async function buildTimbreImage(tedXml, strategyId = DEFAULT_TIMBRE_STRATEGY_ID, { bwip } = {}) {
  const strategy = TIMBRE_STRATEGIES[strategyId];
  if (!strategy) throw new BoletaReceiptError('TIMBRE_STRATEGY_INVALID', String(strategyId));
  const symbol = await encodeTedPdf417(tedXml, { bwip });
  const { bits, width, height } = scalePdf417(symbol, {
    moduleWidthDots: strategy.moduleWidthDots,
    rowHeightDots: strategy.rowHeightDots,
  });
  const widthMm = width / strategy.dotsPerMmX;
  const heightMm = height / strategy.dotsPerMmY;
  const withinSiiSize = widthMm >= SII_TIMBRE_LIMITS_MM.minWidth && widthMm <= SII_TIMBRE_LIMITS_MM.maxWidth
    && heightMm >= SII_TIMBRE_LIMITS_MM.minHeight && heightMm <= SII_TIMBRE_LIMITS_MM.maxHeight;
  return {
    strategyId: strategy.id,
    command: strategy.build(bits, width, height),
    widthDots: width,
    heightDots: height,
    columns: symbol.widthModules,
    rows: symbol.rows,
    widthMm: Math.round(widthMm * 10) / 10,
    heightMm: Math.round(heightMm * 10) / 10,
    withinSiiSize,
    meetsSiiResolution: strategy.meetsSiiResolution,
  };
}

/**
 * @param {Object} params
 * @param {import('../../fiscal/dte/parseDteXml').ParsedDte} params.dte
 * @param {boolean} params.tedVerified - resultado de verifyTedSignature (debe ser true)
 * @param {{ numero: number|string, anio: number|string }} params.resolucion - resolución SII del emisor
 * @param {string} [params.unidadSii] - unidad regional del SII (p. ej. "CONCEPCION"), si corresponde
 * @param {string} [params.nombreFantasia]
 * @param {string} [params.copyLabel] - leyenda superior opcional (p. ej. "PRUEBA DE IMPRESION")
 * @param {string} [params.timbreStrategyId]
 * @param {number} [params.paperWidthMm]
 * @param {boolean} [params.autoCut]
 * @param {string} [params.cutStrategyId]
 * @param {Object} [params.bwip] - inyectable en pruebas
 * @returns {Promise<{ receipt: import('./renderEscPosReceipt').Receipt, timbre: Object }>}
 */
export async function buildBoletaReceipt({
  dte,
  tedVerified,
  resolucion,
  unidadSii,
  nombreFantasia,
  copyLabel,
  timbreStrategyId = DEFAULT_TIMBRE_STRATEGY_ID,
  paperWidthMm = 80,
  autoCut = true,
  cutStrategyId,
  bwip,
} = {}) {
  if (!dte || dte.tipoDte !== 39) throw new BoletaReceiptError('DTE_TYPE_UNSUPPORTED');
  if (tedVerified !== true) throw new BoletaReceiptError('TED_NOT_VERIFIED');
  const resNumero = String(resolucion?.numero ?? '').trim();
  const resAnio = String(resolucion?.anio ?? '').trim();
  if (!/^\d{1,6}$/.test(resNumero) || !/^\d{4}$/.test(resAnio)) {
    throw new BoletaReceiptError('RESOLUCION_REQUIRED');
  }
  if (paperWidthMm !== 80) throw new BoletaReceiptError('PAPER_WIDTH_UNSUPPORTED');

  const timbre = await buildTimbreImage(dte.ted.xml, timbreStrategyId, { bwip });

  const { emisor, totales } = dte;
  const lines = [];
  if (copyLabel) lines.push({ type: 'text', text: clean(copyLabel), align: 'center', bold: true });
  if (nombreFantasia) lines.push({ type: 'text', text: clean(nombreFantasia), align: 'center', bold: true, double: true });
  lines.push({ type: 'text', text: clean(emisor.razonSocial), align: 'center', bold: true });
  lines.push({ type: 'text', text: `RUT: ${formatRut(emisor.rut)}`, align: 'center' });
  if (emisor.giro) lines.push({ type: 'text', text: clean(emisor.giro), align: 'center' });
  const direccion = [emisor.direccion, emisor.comuna, emisor.ciudad !== emisor.comuna ? emisor.ciudad : null]
    .filter(Boolean).map(clean).join(', ');
  if (direccion) lines.push({ type: 'text', text: direccion, align: 'center' });
  if (emisor.sucursal) lines.push({ type: 'text', text: `Sucursal: ${clean(emisor.sucursal)}`, align: 'center' });

  lines.push({ type: 'divider' });
  lines.push({ type: 'text', text: 'BOLETA ELECTRONICA', align: 'center', bold: true, double: true });
  lines.push({ type: 'text', text: `Nro. ${dte.folio}`, align: 'center', bold: true, double: true });
  if (unidadSii) lines.push({ type: 'text', text: `S.I.I. - ${clean(unidadSii).toUpperCase()}`, align: 'center' });
  lines.push({ type: 'divider' });

  lines.push({ type: 'row', left: 'Fecha emision', right: formatFechaEmision(dte.fechaEmision) });
  lines.push({ type: 'itemsHeader' });
  for (const item of dte.items) {
    lines.push({
      type: 'item',
      qty: item.cantidad ?? 1,
      name: item.exento ? `${item.nombre} (EX)` : item.nombre,
      unitPrice: item.precio ?? item.monto,
      lineTotal: item.monto,
    });
  }
  lines.push({ type: 'divider' });
  if (totales.exento) lines.push({ type: 'row', left: 'Monto exento', amount: totales.exento });
  if (totales.neto != null) lines.push({ type: 'row', left: 'Monto neto', amount: totales.neto });
  if (totales.iva != null) lines.push({ type: 'row', left: 'IVA (19%)', amount: totales.iva });
  lines.push({ type: 'total', label: 'TOTAL', amount: totales.total, emphasize: true });

  lines.push({ type: 'text', text: '' });
  lines.push({ type: 'rasterBytes', command: timbre.command });
  lines.push({ type: 'text', text: 'Timbre Electronico SII', align: 'center' });
  lines.push({ type: 'text', text: `Res. ${resNumero} de ${resAnio}`, align: 'center' });
  lines.push({ type: 'text', text: 'Verifique documento: www.sii.cl', align: 'center' });

  return {
    receipt: {
      lines,
      paperWidthMm,
      currency: 'CLP',
      feedLines: 4,
      cut: autoCut !== false,
      cutStrategyId,
    },
    timbre: {
      strategyId: timbre.strategyId,
      widthMm: timbre.widthMm,
      heightMm: timbre.heightMm,
      columns: timbre.columns,
      rows: timbre.rows,
      withinSiiSize: timbre.withinSiiSize,
      meetsSiiResolution: timbre.meetsSiiResolution,
    },
  };
}

/**
 * Ticket de diagnóstico: el MISMO timbre de una boleta real en las tres
 * estrategias, rotuladas, para medir y escanear en la impresora física.
 * No es una representación tributaria (no lleva encabezado ni totales).
 */
export async function buildTimbreDiagnosticReceipt({ dte, tedVerified, paperWidthMm = 80, cutStrategyId, bwip } = {}) {
  if (!dte?.ted?.xml) throw new BoletaReceiptError('DTE_REQUIRED');
  if (tedVerified !== true) throw new BoletaReceiptError('TED_NOT_VERIFIED');
  const lines = [
    { type: 'text', text: 'DIAGNOSTICO TIMBRE PDF417', align: 'center', bold: true },
    { type: 'text', text: 'SIN VALOR TRIBUTARIO', align: 'center', bold: true },
    { type: 'text', text: `Boleta ${dte.folio} - ${formatFechaEmision(dte.fechaEmision)}`, align: 'center' },
    { type: 'divider' },
  ];
  const results = [];
  for (const [index, id] of ['rasterGsV0', 'escStar24', 'escStar8'].entries()) {
    // eslint-disable-next-line no-await-in-loop -- orden de impresión
    const timbre = await buildTimbreImage(dte.ted.xml, id, { bwip });
    results.push({ ...timbre, command: undefined });
    const label = String.fromCharCode(65 + index);
    lines.push({ type: 'text', text: `${label}) ${TIMBRE_STRATEGIES[id].label}`, bold: true });
    lines.push({ type: 'text', text: `Esperado: ${timbre.widthMm} x ${timbre.heightMm} mm` });
    lines.push({ type: 'rasterBytes', command: timbre.command });
    lines.push({ type: 'text', text: `Fin ${label}`, align: 'center' });
    lines.push({ type: 'divider' });
  }
  return {
    receipt: { lines, paperWidthMm, currency: 'CLP', feedLines: 4, cut: true, cutStrategyId },
    timbres: results,
  };
}
