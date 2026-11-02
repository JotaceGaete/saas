// PDF80: etapa PURA de raster a ESC/POS. No interpreta PDF ni emite DTE.
// El renderizador PDF seguro debe entregar píxeles RGBA a resolución nativa.
// Cada franja es un comando independiente y pasa por el validador del conector.
import { rgbaToGrayscale, buildRasterCommand } from './receipts/escPosImage';

export class FiscalRasterError extends Error {
  constructor(code) { super(code); this.name = 'FiscalRasterError'; this.code = code; }
}

const MAX_WIDTH_DOTS = 576;
const MAX_HEIGHT_DOTS = 10000;
const STRIP_HEIGHT = 128;
const ESC_POS_MAX_BYTES = 256 * 1024;

/**
 * @param {{rgba: Uint8ClampedArray, width: number, height: number,
 *  threshold?: number, cut?: boolean}} options
 * @returns {Uint8Array} ESC/POS; apto para POST /v1/print si cabe en 256 KiB.
 */
export function encodeFiscalRaster({ rgba, width, height, threshold = 160, cut = true } = {}) {
  if (!Number.isInteger(width) || width < 1 || width > MAX_WIDTH_DOTS ||
      !Number.isInteger(height) || height < 1 || height > MAX_HEIGHT_DOTS) {
    throw new FiscalRasterError('RASTER_DIMENSIONS_INVALID');
  }
  if (!(rgba instanceof Uint8ClampedArray) || rgba.length !== width * height * 4) {
    throw new FiscalRasterError('RASTER_PIXELS_INVALID');
  }
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > 254) {
    throw new FiscalRasterError('RASTER_THRESHOLD_INVALID');
  }
  const grayscale = rgbaToGrayscale(rgba, width, height);
  const chunks = [Uint8Array.from([0x1b, 0x40])]; // ESC @
  let total = 2;
  for (let y = 0; y < height; y += STRIP_HEIGHT) {
    const stripHeight = Math.min(STRIP_HEIGHT, height - y);
    const bits = new Uint8Array(width * stripHeight);
    for (let i = 0; i < bits.length; i++) bits[i] = grayscale[y * width + i] < threshold ? 1 : 0;
    const command = buildRasterCommand(bits, width, stripHeight);
    chunks.push(command);
    total += command.length;
    if (total > ESC_POS_MAX_BYTES - 8) throw new FiscalRasterError('RASTER_PAYLOAD_TOO_LARGE');
  }
  const end = Uint8Array.from(cut
    ? [0x1b, 0x64, 0x03, 0x1d, 0x56, 0x42, 0x00] // ESC d 3, GS V 66 0
    : [0x1b, 0x64, 0x03]);
  chunks.push(end);
  total += end.length;
  if (total > ESC_POS_MAX_BYTES) throw new FiscalRasterError('RASTER_PAYLOAD_TOO_LARGE');
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}
