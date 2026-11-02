// Timbre electrónico (TED) -> código PDF417 como matriz de bits monocroma.
//
// Requisitos del SII usados aquí (fuentes en docs/fiscal/REPRESENTACION_BOLETA_80MM.md):
//  - Simbología PDF417 con el TED completo (texto ISO-8859-1, sin espacio entre etiquetas).
//  - Nivel de corrección de errores 5.
//  - Tamaño mínimo 2 x 4,5 cm (boletas) y máximo 4 x 9 cm.
//  - Impresión a más de 200 dpi.
// Con X = 2 dots y filas de 5 dots a 203 dpi, 12 columnas de datos dan
// unos 68 x 31 mm para un TED típico de boleta (~725 bytes).
//
// La librería (bwip-js) se carga solo al imprimir un timbre, para no sumar
// su peso al bundle principal.

export class TedBarcodeError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'TedBarcodeError';
    this.code = code;
  }
}

export const TED_PDF417_DEFAULTS = Object.freeze({
  eclevel: 5,
  columns: 12,
});

// Medidas físicas a 203 dpi (8 dots/mm).
export const DOTS_PER_MM_203DPI = 203 / 25.4;
export const SII_TIMBRE_LIMITS_MM = Object.freeze({
  minWidth: 45, minHeight: 20, maxWidth: 90, maxHeight: 40,
});

let bwipPromise = null;
async function loadBwip() {
  if (!bwipPromise) {
    bwipPromise = import('bwip-js').then((mod) => mod.default ?? mod);
  }
  return bwipPromise;
}

/**
 * @param {string} tedXml - TED aplanado (ParsedDte.ted.xml)
 * @param {Object} [options]
 * @param {number} [options.columns]
 * @param {number} [options.eclevel]
 * @param {Object} [options.bwip] - inyectable en pruebas
 * @returns {Promise<{ modules: Uint8Array, widthModules: number, rows: number }>}
 */
export async function encodeTedPdf417(tedXml, { columns = TED_PDF417_DEFAULTS.columns, eclevel = TED_PDF417_DEFAULTS.eclevel, bwip } = {}) {
  if (typeof tedXml !== 'string' || !tedXml.startsWith('<TED') || !tedXml.endsWith('</TED>')) {
    throw new TedBarcodeError('TED_INVALID');
  }
  for (let i = 0; i < tedXml.length; i++) {
    if (tedXml.charCodeAt(i) > 0xff) throw new TedBarcodeError('TED_NOT_LATIN1');
  }
  const lib = bwip || await loadBwip();
  let symbol;
  try {
    [symbol] = lib.raw('pdf417', tedXml, { eclevel, columns });
  } catch (err) {
    throw new TedBarcodeError('PDF417_ENCODE_FAILED', String(err?.message || err).slice(0, 200));
  }
  const widthModules = symbol?.pixx;
  const pixs = symbol?.pixs;
  if (!widthModules || !pixs?.length || pixs.length % widthModules !== 0) {
    throw new TedBarcodeError('PDF417_ENCODE_FAILED', 'matriz inesperada');
  }
  return {
    modules: Uint8Array.from(pixs, (v) => (v ? 1 : 0)),
    widthModules,
    rows: pixs.length / widthModules,
  };
}

/**
 * Escala la matriz de módulos a dots de impresora, con zona de silencio.
 * @param {{ modules: Uint8Array, widthModules: number, rows: number }} symbol
 * @param {{ moduleWidthDots: number, rowHeightDots: number, quietZoneDots?: number }} scale
 * @returns {{ bits: Uint8Array, width: number, height: number }}
 */
export function scalePdf417(symbol, { moduleWidthDots, rowHeightDots, quietZoneDots = 0 }) {
  const mw = moduleWidthDots | 0;
  const rh = rowHeightDots | 0;
  const q = Math.max(0, quietZoneDots | 0);
  if (mw < 1 || rh < 1) throw new TedBarcodeError('PDF417_SCALE_INVALID');
  const width = symbol.widthModules * mw + 2 * q;
  const height = symbol.rows * rh + 2 * q;
  const bits = new Uint8Array(width * height);
  for (let r = 0; r < symbol.rows; r++) {
    for (let c = 0; c < symbol.widthModules; c++) {
      if (!symbol.modules[r * symbol.widthModules + c]) continue;
      for (let dy = 0; dy < rh; dy++) {
        const rowOffset = (q + r * rh + dy) * width + q + c * mw;
        bits.fill(1, rowOffset, rowOffset + mw);
      }
    }
  }
  return { bits, width, height };
}
