// PRINT-1 — capacidades genéricas de impresión ESC/POS (estándar, no de
// marca): alineación, negrita, doble tamaño, avance de papel y corte. No
// debe agregarse acá nada específico de un modelo/fabricante -- eso, si
// alguna vez hiciera falta, iría dentro de un provider concreto (ver
// providers/printerProvider.js), nunca en este renderer.

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
  CUT: [GS, 0x56, 0x00],       // GS V 0 — corte total
};

// Columnas de texto habituales para fuente A a estos anchos de papel.
// Solo afecta el largo de los separadores que arma buildTestReceipt --
// el propio comando de corte/impresión no depende de esto.
const COLUMNS_BY_WIDTH_MM = { 58: 32, 80: 48 };

function columnsForWidth(paperWidthMm) {
  return COLUMNS_BY_WIDTH_MM[paperWidthMm] || COLUMNS_BY_WIDTH_MM[80];
}

// Sin selección de codepage (fuera de alcance de PRINT-1): cualquier
// carácter fuera de Latin-1 se reemplaza por '?' en vez de mandar bytes
// UTF-8 que la impresora interpretaría como basura.
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

function stripDiacritics(value) {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * @typedef {Object} ReceiptLine
 * @property {string} text
 * @property {'left'|'center'} [align]
 * @property {boolean} [bold]
 * @property {boolean} [double]
 */
/**
 * @typedef {Object} Receipt
 * @property {ReceiptLine[]} lines
 * @property {number} [feedLines]
 * @property {boolean} [cut]
 */

/**
 * Receipt -> comandos ESC/POS crudos, listos para PrinterProvider.print().
 * El ancho de papel no cambia los comandos emitidos acá (init/corte son
 * iguales a 58 o 80mm); quien arma el Receipt (ver buildTestReceipt) es
 * responsable de ajustar el contenido -- p. ej. el largo de los
 * separadores -- al ancho real.
 */
export function renderEscPosReceipt(receipt) {
  const bytes = [...CMD.INIT];
  for (const line of receipt?.lines || []) {
    bytes.push(...(line.align === 'center' ? CMD.ALIGN_CENTER : CMD.ALIGN_LEFT));
    if (line.bold) bytes.push(...CMD.BOLD_ON);
    if (line.double) bytes.push(...CMD.DOUBLE_ON);
    bytes.push(...textBytes(line.text));
    if (line.double) bytes.push(...CMD.DOUBLE_OFF);
    if (line.bold) bytes.push(...CMD.BOLD_OFF);
  }
  const feedLines = Number.isFinite(receipt?.feedLines) ? receipt.feedLines : 3;
  for (let i = 0; i < feedLines; i++) bytes.push(LF);
  if (receipt?.cut !== false) bytes.push(...CMD.CUT);
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
