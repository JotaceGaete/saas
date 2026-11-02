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
import {
  buildRasterCommand, buildTiledColumnBitImageCommand, buildDoubleDensity24BitImageCommand, buildStarSafe24DotImageCommand,
} from './escPosImage';
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

// Cómo se imprime el timbre. Solo las estrategias con `meetsSiiResolution`
// cumplen el mínimo del SII (> 200 dpi). `columns` son las columnas de datos
// del PDF417: con 12 el símbolo mide 546 dots (68 mm) y necesita un cabezal
// de 576 dots (72 mm imprimibles, lo habitual en 80 mm, p. ej. Xprinter
// XP-80); con 10 mide 478 dots (60 mm) y cabe también en cabezales de 512.
// Ninguna está validada todavía en papel.
export const TIMBRE_STRATEGIES = Object.freeze({
  rasterGsV0: Object.freeze({
    id: 'rasterGsV0',
    label: 'GS v 0 raster, 203 dpi, 12 columnas',
    columns: 12,
    moduleWidthDots: 2,
    rowHeightDots: 5,
    dotsPerMmX: DOTS_PER_MM_203DPI,
    dotsPerMmY: DOTS_PER_MM_203DPI,
    meetsSiiResolution: true,
    build: (bits, width, height) => buildRasterCommand(bits, width, height),
  }),
  escStar24: Object.freeze({
    id: 'escStar24',
    label: 'ESC * 33 en franjas de 24 dots, 203 dpi, 12 columnas',
    columns: 12,
    moduleWidthDots: 2,
    rowHeightDots: 5,
    dotsPerMmX: DOTS_PER_MM_203DPI,
    dotsPerMmY: DOTS_PER_MM_203DPI,
    meetsSiiResolution: true,
    build: (bits, width, height) => buildDoubleDensity24BitImageCommand(bits, width, height),
  }),
  // Igual que rasterGsV0 pero más angosto (y más alto): para impresoras cuyo
  // ancho imprimible sea de 512 dots (64 mm) en vez de 576.
  rasterGsV0Narrow: Object.freeze({
    id: 'rasterGsV0Narrow',
    label: 'GS v 0 raster, 203 dpi, 10 columnas (angosto)',
    columns: 10,
    moduleWidthDots: 2,
    rowHeightDots: 5,
    dotsPerMmX: DOTS_PER_MM_203DPI,
    dotsPerMmY: DOTS_PER_MM_203DPI,
    meetsSiiResolution: true,
    build: (bits, width, height) => buildRasterCommand(bits, width, height),
  }),
  // Star TSP100/TSP143 (emulación ESC/POS del driver futurePRNT). Lo que se
  // sabe del hardware real: `GS v 0` sale como texto; `ESC *` + `ESC $` sí
  // imprimen; `ESC *` de densidad simple dibuja cada columna con 2 dots de
  // ancho (100 columnas = 25 mm, PRINT-4-BUG13); una imagen posicionada más
  // allá de ~440 dots físicos se corta o reaparece a la izquierda
  // (PRINT-4-BUG10/11).
  //
  // Modo por defecto: `ESC * 32`. El bitmap va a media densidad horizontal
  // (1 columna por módulo) y la impresora duplica cada columna: el módulo
  // físico mide 2 dots (0,25 mm) a 203 dpi del cabezal, en filas de 4 dots
  // físicos. Es el mismo papel que con `ESC * 33` y X = 2, pero con 205
  // columnas por franja (nH = 0) y la misma densidad horizontal que el logo
  // que ya imprime bien. 8 columnas de datos: 205 módulos = 410 dots
  // (51 mm), en x = 16 (borde derecho en 426 < 440); 75 filas x 4 = 37,5 mm
  // con la 51106. Ver buildStarSafe24DotImageCommand.
  starTsp100: Object.freeze({
    id: 'starTsp100',
    label: 'Star TSP100/TSP143: ESC * 32, módulo 0,25 mm, 8 columnas',
    columns: 8,
    moduleWidthDots: 1,
    rowHeightDots: 4,
    dotsPerMmX: DOTS_PER_MM_203DPI / 2,
    dotsPerMmY: DOTS_PER_MM_203DPI,
    physicalDotsPerColumn: 2,
    meetsSiiResolution: true,
    align: 'left',
    build: (bits, width, height) => buildStarSafe24DotImageCommand(bits, width, height, {
      xDots: STAR_TIMBRE_X_DOTS, density: 'single',
    }),
  }),
  // Alternativa manual: el mismo timbre con `ESC * 33` (1 columna = 1 dot).
  starTsp100Double: Object.freeze({
    id: 'starTsp100Double',
    label: 'Star TSP100/TSP143: ESC * 33, 203 dpi, 8 columnas',
    columns: 8,
    moduleWidthDots: 2,
    rowHeightDots: 4,
    dotsPerMmX: DOTS_PER_MM_203DPI,
    dotsPerMmY: DOTS_PER_MM_203DPI,
    physicalDotsPerColumn: 1,
    meetsSiiResolution: true,
    align: 'left',
    build: (bits, width, height) => buildStarSafe24DotImageCommand(bits, width, height, {
      xDots: STAR_TIMBRE_X_DOTS, density: 'double',
    }),
  }),
  // Misma ruta ESC * m=0 validada para el logo en la TSP100: ~101 dpi en
  // horizontal y ~69 dpi en vertical (100 x 100 dots midieron 25 x 37 mm).
  // NO cumple la resolución del SII; queda solo como referencia de lectura.
  escStar8: Object.freeze({
    id: 'escStar8',
    label: 'ESC * 0 (8 dots, ~101 dpi, no cumple SII)',
    columns: 12,
    moduleWidthDots: 1,
    rowHeightDots: 2,
    dotsPerMmX: 4,
    dotsPerMmY: 100 / 37,
    meetsSiiResolution: false,
    build: (bits, width, height) => buildTiledColumnBitImageCommand(bits, width, height),
  }),
});

export const DEFAULT_TIMBRE_STRATEGY_ID = 'rasterGsV0';

/** Valor de `ESC $` del timbre en la Star: margen izquierdo / zona de silencio. */
export const STAR_TIMBRE_X_DOTS = 16;

/** Opción "automático" del selector: el modo se elige según la impresora. */
export const AUTO_TIMBRE_STRATEGY_ID = 'auto';

const STAR_TSP100_QUEUE = /\bstar\b.*\btsp\s*1\d\d|\btsp\s*143/i;

/**
 * Modo del timbre según la impresora de destino. La Star TSP100/TSP143 nunca
 * recibe `GS v 0`; si la impresora usa el perfil "Compatibilidad" (raster)
 * o no se reconoce, se mantiene el comportamiento anterior (`GS v 0`).
 * @param {{ printerName?: string|null, imageMode?: string|null }} printer
 */
export function resolveTimbreStrategyId({ printerName, imageMode } = {}, requested = AUTO_TIMBRE_STRATEGY_ID) {
  if (requested && requested !== AUTO_TIMBRE_STRATEGY_ID && TIMBRE_STRATEGIES[requested]) return requested;
  if (printerName && STAR_TSP100_QUEUE.test(String(printerName))) return 'starTsp100';
  if (imageMode === 'rasterGsV0') return 'rasterGsV0';
  return DEFAULT_TIMBRE_STRATEGY_ID;
}

/** Estrategias que se ofrecen al usuario y que salen en el diagnóstico (todas cumplen > 200 dpi). */
export const SELECTABLE_TIMBRE_STRATEGY_IDS = Object.freeze(['rasterGsV0', 'escStar24', 'rasterGsV0Narrow']);

/** Modos que se ofrecen en el selector manual (además de "automático"). */
export const MANUAL_TIMBRE_STRATEGY_IDS = Object.freeze(['starTsp100', 'starTsp100Double', 'rasterGsV0', 'escStar24', 'rasterGsV0Narrow']);

/**
 * Leyendas de reimpresión: dejan claro que el papel es una copia de un
 * documento ya emitido y aceptado en su momento, no una emisión nueva.
 */
export function buildReprintNotice(dte) {
  return {
    header: [
      { type: 'text', text: 'REIMPRESION', align: 'center', bold: true, double: true },
      { type: 'text', text: `Documento emitido el ${formatFechaEmision(dte.fechaEmision)}`, align: 'center' },
      { type: 'text', text: 'No corresponde a una nueva emision', align: 'center' },
    ],
    footer: [
      { type: 'text', text: '' },
      { type: 'text', text: `REIMPRESION BOLETA ${dte.folio} - NO ES NUEVA EMISION`, align: 'center', bold: true },
    ],
  };
}

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
  const symbol = await encodeTedPdf417(tedXml, { bwip, columns: strategy.columns });
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
    align: strategy.align || 'center',
    widthDots: width * (strategy.physicalDotsPerColumn || 1),
    bitmapColumns: width,
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
 * @param {boolean} [params.reprint] - agrega las leyendas de reimpresión arriba y abajo (buildReprintNotice)
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
  reprint = false,
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
  const hasResolucion = /^\d{1,6}$/.test(resNumero) && /^\d{4}$/.test(resAnio);
  // Una boleta nueva nunca sale sin resolución. Una REIMPRESIÓN de un
  // documento ya aceptado puede salir mientras el contador confirma el dato,
  // y lo dice en el papel en vez de inventarlo.
  if (!hasResolucion && (!reprint || resNumero || resAnio)) {
    throw new BoletaReceiptError('RESOLUCION_REQUIRED');
  }
  if (paperWidthMm !== 80) throw new BoletaReceiptError('PAPER_WIDTH_UNSUPPORTED');

  const timbre = await buildTimbreImage(dte.ted.xml, timbreStrategyId, { bwip });

  const { emisor, totales } = dte;
  const notice = reprint ? buildReprintNotice(dte) : null;
  const lines = [];
  if (notice) lines.push(...notice.header, { type: 'divider' });
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
  lines.push({ type: 'rasterBytes', command: timbre.command, align: timbre.align });
  lines.push({ type: 'text', text: 'Timbre Electronico SII', align: 'center' });
  lines.push({ type: 'text', text: hasResolucion ? `Res. ${resNumero} de ${resAnio}` : 'Res. SII: por confirmar', align: 'center' });
  lines.push({ type: 'text', text: 'Verifique documento: www.sii.cl', align: 'center' });
  if (notice) lines.push(...notice.footer);

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
      widthDots: timbre.widthDots,
      heightDots: timbre.heightDots,
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
    { type: 'text', text: `Reimpresion del timbre de la boleta ${dte.folio}`, align: 'center' },
    { type: 'text', text: `emitida el ${formatFechaEmision(dte.fechaEmision)}. No es nueva emision.`, align: 'center' },
    { type: 'divider' },
  ];
  const results = [];
  for (const [index, id] of SELECTABLE_TIMBRE_STRATEGY_IDS.entries()) {
    // eslint-disable-next-line no-await-in-loop -- orden de impresión
    const timbre = await buildTimbreImage(dte.ted.xml, id, { bwip });
    results.push({ ...timbre, command: undefined });
    const label = String.fromCharCode(65 + index);
    lines.push({ type: 'text', text: `${label}) ${TIMBRE_STRATEGIES[id].label}`, bold: true });
    lines.push({ type: 'text', text: `Esperado: ${timbre.widthMm} x ${timbre.heightMm} mm (${timbre.widthDots} dots de ancho)` });
    lines.push({ type: 'rasterBytes', command: timbre.command, align: timbre.align });
    lines.push({ type: 'text', text: `Fin ${label}`, align: 'center' });
    lines.push({ type: 'divider' });
  }
  lines.push({ type: 'text', text: 'Si un timbre sale cortado a la derecha, use el C.', align: 'center' });
  return {
    receipt: { lines, paperWidthMm, currency: 'CLP', feedLines: 4, cut: true, cutStrategyId },
    timbres: results,
  };
}
