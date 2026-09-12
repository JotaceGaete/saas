// PRINT-1/PRINT-4 — capacidades genéricas de impresión ESC/POS (estándar,
// no de marca): alineación, negrita, doble tamaño, imagen raster, avance
// de papel y corte. No debe agregarse acá nada específico de un
// modelo/fabricante -- eso, si alguna vez hiciera falta, iría dentro de
// un provider concreto (ver providers/printerProvider.js), nunca en este
// renderer.
//
// PRINT-4 — este renderer pasa a ser DUEÑO de toda la presentación: además
// de los comandos ESC/POS, decide el ancho de columnas, el wrap de texto
// largo, el layout de la tabla de ítems y el formato de moneda. El
// builder (buildSaleReceipt.js) solo entrega datos semánticos crudos
// (números, strings sin formatear) -- ver el `type` de cada línea más
// abajo. Esto mantiene la regla de la arquitectura: "el builder define
// contenido, el renderer decide presentación".

import { formatMoney } from 'utils/formatMoney';
import { fetchLogoRaster } from './fetchLogoRaster';
import { buildRasterCommand } from './escPosImage';

const ESC = 0x1B;
const GS = 0x1D;
const LF = 0x0A;

// Comandos ESC/POS estándar, soportados por la enorme mayoría de
// impresoras térmicas compatibles (no solo Star/Epson).
const CMD = {
  INIT: [ESC, 0x40],           // ESC @   — reinicia la impresora
  ALIGN_LEFT: [ESC, 0x61, 0x00],   // ESC a 0
  ALIGN_CENTER: [ESC, 0x61, 0x01], // ESC a 1
  BOLD_ON: [ESC, 0x45, 0x01],  // ESC E 1
  BOLD_OFF: [ESC, 0x45, 0x00], // ESC E 0
  DOUBLE_ON: [GS, 0x21, 0x11],  // GS !  0x11 — doble ancho + doble alto
  DOUBLE_OFF: [GS, 0x21, 0x00], // GS !  0x00
  // PRINT-4-BUG (corte no funcionaba): la forma anterior [GS,0x56,0x00]
  // es el formato LEGACY de 1 byte "GS V m". La especificación ESC/POS
  // moderna (Epson, y la emulación ESC/POS de Star, que es la que reporta
  // el TSP100) usa la forma parametrizada de 2 bytes "GS V m n". Al
  // enviar solo 1 byte, buena parte de los firmwares se queda esperando
  // el segundo parámetro que nunca llega (es el último comando del
  // trabajo) y el corte simplemente nunca se ejecuta -- el resto del
  // ticket (texto) imprime bien porque no depende de ese segundo byte.
  // Se usa corte PARCIAL (m=66/'B') por preferencia explícita del
  // encargo: dispara el mecanismo de corte pero deja una fibra de papel
  // sin cortar, más tolerante en impresoras/cuchillas distintas que un
  // corte total. Es comando estándar Epson/ESC-POS, no específico de
  // Star/TSP100.
  CUT_PARTIAL: [GS, 0x56, 0x42, 0x00], // GS V 66 0 — corte parcial (forma moderna, 2 bytes de parámetro)
  CUT_FULL: [GS, 0x56, 0x41, 0x00],    // GS V 65 0 — corte total (forma moderna) -- no usado por defecto, queda disponible
};

// Columnas de texto habituales para fuente A a estos anchos de papel. El
// resto del renderer (wrap, tablas, alineación derecha) se apoya en este
// número de columnas -- ES la abstracción que permite soportar 58mm sin
// hardcodear nada más adelante.
const COLUMNS_BY_WIDTH_MM = { 58: 32, 80: 48 };

export function columnsForWidth(paperWidthMm) {
  return COLUMNS_BY_WIDTH_MM[paperWidthMm] || COLUMNS_BY_WIDTH_MM[80];
}

// Puntos (dots) de ancho imprimible aproximados para el logo, a la
// densidad estándar de cabezales térmicos de 203dpi -- 384 dots a 58mm y
// 576 dots a 80mm son los anchos de línea habituales en la enorme mayoría
// de impresoras térmicas ESC/POS (no un número específico de marca). Se
// deja un margen prudente para no depender de calibraciones exactas.
const LOGO_MAX_WIDTH_DOTS_BY_PAPER_MM = { 58: 320, 80: 480 };
const LOGO_MAX_HEIGHT_DOTS = 200;

// Sin selección de codepage (fuera de alcance): cualquier carácter fuera
// de Latin-1 se reemplaza por '?' en vez de mandar bytes UTF-8 que la
// impresora interpretaría como basura.
function textBytes(text) {
  const bytes = [];
  const value = String(text ?? '');
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    bytes.push(code < 256 ? code : 0x3F);
  }
  bytes.push(LF);
  return bytes;
}

// Exportada para que ningún receipt builder duplique esta normalización.
export function stripDiacritics(value) {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Wrap por palabras a `width` columnas. Nunca trunca: una palabra más
// larga que `width` se corta en pedazos de `width` (mejor que un
// desborde impredecible en la impresora). Texto vacío -> [''] para que el
// llamador siempre tenga al menos una línea que emitir.
export function wrapText(text, width) {
  const safeWidth = Math.max(1, width | 0);
  const value = String(text ?? '');
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines = [];
  let current = '';
  for (const word of words) {
    if (word.length > safeWidth) {
      if (current) {
        lines.push(current);
        current = '';
      }
      let remaining = word;
      while (remaining.length > safeWidth) {
        lines.push(remaining.slice(0, safeWidth));
        remaining = remaining.slice(safeWidth);
      }
      current = remaining;
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > safeWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

// Arma una fila "etiqueta ..... valor" (valor alineado a la derecha). Si
// no cabe en una línea, la etiqueta se envuelve y el valor queda en su
// propia línea, también alineado a la derecha -- nunca se trunca ninguno
// de los dos lados.
export function formatRowLines(left, right, width) {
  const safeWidth = Math.max(1, width | 0);
  const leftText = String(left ?? '');
  const rightText = String(right ?? '');

  if (leftText.length + 1 + rightText.length <= safeWidth) {
    const padding = safeWidth - leftText.length - rightText.length;
    return [leftText + ' '.repeat(Math.max(1, padding)) + rightText];
  }

  const leftLines = wrapText(leftText, safeWidth);
  const rightLine = rightText.length < safeWidth
    ? ' '.repeat(safeWidth - rightText.length) + rightText
    : rightText;
  return [...leftLines, rightLine];
}

// Cantidad -> "2x" (unidades) o "1.5x" (peso/fracción) sin ceros de
// relleno -- ambos casos deben quedar legibles en el ticket.
function formatQuantity(qty) {
  const num = Number(qty);
  if (!Number.isFinite(num)) return `${qty ?? ''}x`;
  if (Number.isInteger(num)) return `${num}x`;
  return `${num.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}x`;
}

// Línea(s) de un ítem del ticket: cabecera "Nx Producto ... $total"
// (envuelta si el nombre es largo), sub-línea de precio unitario, y nota
// opcional -- todo esto es presentación pura, por eso vive en el
// renderer y no en buildSaleReceipt.
function formatItemLines(item, columns, defaultCurrency) {
  const currency = item.currency ?? defaultCurrency;
  const qtyStr = formatQuantity(item.qty);
  const name = stripDiacritics(item.name || '');
  const unitPriceStr = formatMoney(item.unitPrice, currency);
  const lineTotalStr = formatMoney(item.lineTotal, currency);
  const header = `${qtyStr} ${name}`.trim();

  const lines = [...formatRowLines(header, lineTotalStr, columns)];
  lines.push(...wrapText(`  ${unitPriceStr} c/u`, columns));
  if (item.note) lines.push(...wrapText(`  ${stripDiacritics(item.note)}`, columns));
  return lines;
}

/**
 * @typedef {Object} ReceiptLine
 * @property {'text'|'divider'|'row'|'itemsHeader'|'item'|'total'|'logo'} [type='text']
 */
/**
 * @typedef {Object} Receipt
 * @property {ReceiptLine[]} lines
 * @property {number} [feedLines]
 * @property {boolean} [cut]
 * @property {number} [paperWidthMm]
 * @property {string} [currency]
 */

/**
 * Receipt -> comandos ESC/POS crudos, listos para PrinterProvider.print().
 * Async porque el logo (type: 'logo') requiere cargar/rasterizar una
 * imagen (fetch + canvas) -- si eso falla o no hay logo, simplemente no
 * se emite esa línea y el resto del ticket imprime normal.
 */
export async function renderEscPosReceipt(receipt) {
  const paperWidthMm = receipt?.paperWidthMm || 80;
  const columns = columnsForWidth(paperWidthMm);
  const currency = receipt?.currency;
  const bytes = [...CMD.INIT];

  const emit = (text, { align, bold, double } = {}) => {
    bytes.push(...(align === 'center' ? CMD.ALIGN_CENTER : CMD.ALIGN_LEFT));
    if (bold) bytes.push(...CMD.BOLD_ON);
    if (double) bytes.push(...CMD.DOUBLE_ON);
    bytes.push(...textBytes(text));
    if (double) bytes.push(...CMD.DOUBLE_OFF);
    if (bold) bytes.push(...CMD.BOLD_OFF);
  };

  const emitWrapped = (text, opts = {}) => {
    const width = opts.double ? Math.max(1, Math.floor(columns / 2)) : columns;
    for (const wrapped of wrapText(text, width)) emit(wrapped, opts);
  };

  for (const line of receipt?.lines || []) {
    const type = line?.type || 'text';
    switch (type) {
      case 'logo': {
        const maxWidthDots = LOGO_MAX_WIDTH_DOTS_BY_PAPER_MM[paperWidthMm] || LOGO_MAX_WIDTH_DOTS_BY_PAPER_MM[80];
        // eslint-disable-next-line no-await-in-loop -- el orden de impresión importa, no se puede paralelizar
        const raster = await fetchLogoRaster(line.url, { maxWidthDots, maxHeightDots: LOGO_MAX_HEIGHT_DOTS });
        if (raster?.command?.length) {
          bytes.push(...CMD.ALIGN_CENTER);
          bytes.push(...raster.command);
          bytes.push(LF);
        }
        break;
      }
      // PRINT-4-BUG1: comando raster ya construido (sin pasar por
      // fetchLogoRaster/canvas) -- lo usa buildRasterDiagnosticReceipt para
      // poder aislar, en una impresión física, si el problema está en el
      // comando GS v 0 en sí (esta línea) o en la carga/rasterización de una
      // imagen real (type: 'logo').
      case 'rasterBytes':
        if (line.command?.length) {
          bytes.push(...CMD.ALIGN_CENTER);
          bytes.push(...line.command);
          bytes.push(LF);
        }
        break;
      case 'divider':
        emit('-'.repeat(columns));
        break;
      case 'row': {
        const rightText = line.amount != null ? formatMoney(line.amount, line.currency ?? currency) : (line.right ?? '');
        for (const rowLine of formatRowLines(line.left, rightText, columns)) {
          emit(rowLine, { bold: line.bold });
        }
        break;
      }
      case 'itemsHeader':
        emit(formatRowLines('CANT/PRODUCTO', 'TOTAL', columns)[0], { bold: true });
        break;
      case 'item':
        for (const itemLine of formatItemLines(line, columns, currency)) emit(itemLine);
        break;
      case 'total': {
        const amountStr = formatMoney(line.amount, line.currency ?? currency);
        if (line.emphasize) {
          const halfWidth = Math.max(1, Math.floor(columns / 2));
          const doubleRows = formatRowLines(line.label, amountStr, halfWidth);
          if (doubleRows.length === 1) {
            emit(doubleRows[0], { bold: true, double: true });
            break;
          }
        }
        for (const rowLine of formatRowLines(line.label, amountStr, columns)) {
          emit(rowLine, { bold: true });
        }
        break;
      }
      case 'text':
      default:
        emitWrapped(line.text, { align: line.align, bold: line.bold, double: line.double });
        break;
    }
  }

  const feedLines = Number.isFinite(receipt?.feedLines) ? receipt.feedLines : 3;
  for (let i = 0; i < feedLines; i++) bytes.push(LF);
  if (receipt?.cut !== false) bytes.push(...CMD.CUT_PARTIAL);
  return new Uint8Array(bytes);
}

/** Arma el Receipt (datos planos, sin ESC/POS) del ticket de prueba de PRINT-1. */
export function buildTestReceipt({ businessName = 'Walinka', printerName = '', paperWidthMm = 80 } = {}) {
  const columns = columnsForWidth(paperWidthMm);
  const divider = { text: '-'.repeat(columns) };
  const now = new Date();
  const fecha = now.toLocaleString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return {
    paperWidthMm,
    lines: [
      { text: stripDiacritics(businessName).toUpperCase() || 'WALINKA', align: 'center', bold: true, double: true },
      { text: 'Ticket de prueba', align: 'center' },
      divider,
      { text: `Impresora: ${printerName || 'no seleccionada'}` },
      { text: `Ancho: ${paperWidthMm} mm` },
      { text: `Fecha: ${fecha}` },
      divider,
      { text: 'Este ticket confirma que la' },
      { text: 'conexion con tu impresora' },
      { text: 'termica esta funcionando.' },
      divider,
      { text: 'Todo listo!', align: 'center', bold: true },
    ],
    feedLines: 4,
    cut: true,
  };
}

// PRINT-4-BUG1: bitmap fijo de diagnóstico (tablero de 8x8, sin depender
// de ninguna imagen real) para poder aislar en una impresión física si el
// comando GS v 0 en sí es compatible con la impresora, separado de
// cualquier problema de carga/rasterización de un logo real.
function buildCheckerboardBits(size) {
  const bits = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) bits[y * size + x] = (x + y) % 2;
  }
  return bits;
}

/**
 * Arma el Receipt de diagnóstico de PRINT-4-BUG1: texto ASCII conocido +
 * un raster mínimo (tablero de 8x8) generado en el momento -- no requiere
 * red ni un logo real. Sirve para la prueba física de dos pasos que pide
 * el bug: (A) solo texto -- ver buildTestReceipt -- y (B) texto + este
 * raster, para aislar si el fallo está en el comando de imagen en sí.
 */
export function buildRasterDiagnosticReceipt({ paperWidthMm = 80 } = {}) {
  const bits = buildCheckerboardBits(8);
  const command = buildRasterCommand(bits, 8, 8);
  return {
    paperWidthMm,
    lines: [
      { text: 'TEST WALINKA', align: 'center', bold: true },
      { text: 'Prueba de imagen (diagnostico)', align: 'center' },
      { type: 'divider' },
      { type: 'rasterBytes', command },
      { type: 'divider' },
      { text: 'Fin de la prueba de imagen', align: 'center' },
    ],
    feedLines: 4,
    cut: true,
  };
}
