// Render de PDF fiscal YA EMITIDO a ESC/POS. Sin red, emisión ni impresión.
// Inyecta pdfjsLib para mantener este módulo independiente de la versión del
// motor PDF; el caller debe cargar pdfjs-dist con worker configurado.
import { preflightFiscalPdf } from './pdf80Preflight';
import { encodeFiscalRaster, FiscalRasterError } from './pdf80Raster';

export class FiscalPdfRenderError extends Error {
  constructor(code) { super(code); this.name = 'FiscalPdfRenderError'; this.code = code; }
}

const MM_PER_INCH = 25.4;
const POINTS_PER_INCH = 72;
const TARGET_DPI = 203;
const MAX_PRINT_WIDTH_DOTS = 576;
const MAX_PAGE_HEIGHT_DOTS = 10000;
const MAX_PAGES = 1;

/**
 * @param {{
 *   pdfBytes: Uint8Array | ArrayBuffer,
 *   pdfjsLib: {getDocument: Function},
 *   createCanvas: (width: number, height: number) => {canvas: object, context: object},
 *   printableWidthDots?: number,
 *   cut?: boolean,
 * }} args
 */
export async function renderFiscalPdf80ToEscPos({
  pdfBytes, pdfjsLib, createCanvas, printableWidthDots = MAX_PRINT_WIDTH_DOTS, cut = true,
} = {}) {
  const bytes = preflightFiscalPdf(pdfBytes);
  if (!pdfjsLib || typeof pdfjsLib.getDocument !== 'function' || typeof createCanvas !== 'function') {
    throw new FiscalPdfRenderError('PDF_RENDERER_NOT_CONFIGURED');
  }
  if (!Number.isInteger(printableWidthDots) || printableWidthDots < 128 || printableWidthDots > MAX_PRINT_WIDTH_DOTS) {
    throw new FiscalPdfRenderError('PRINTER_WIDTH_INVALID');
  }

  // PDF.js puede transferir el ArrayBuffer a su worker: usar copia para
  // conservar los bytes originales en el caller.
  const task = pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false });
  let doc;
  try {
    doc = await task.promise;
    if (doc.numPages !== MAX_PAGES) throw new FiscalPdfRenderError('PDF_PAGE_COUNT_UNSUPPORTED');
    const page = await doc.getPage(1);
    const original = page.getViewport({ scale: 1 });
    const widthMm = original.width * MM_PER_INCH / POINTS_PER_INCH;
    if (!Number.isFinite(widthMm) || widthMm < 55 || widthMm > 82) {
      throw new FiscalPdfRenderError('PDF_PAPER_WIDTH_NOT_80MM');
    }
    const nativeScale = TARGET_DPI / POINTS_PER_INCH;
    const scale = Math.min(nativeScale, printableWidthDots / original.width);
    const viewport = page.getViewport({ scale });
    const width = Math.ceil(viewport.width);
    const height = Math.ceil(viewport.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 ||
        width > printableWidthDots || height < 1 || height > MAX_PAGE_HEIGHT_DOTS) {
      throw new FiscalPdfRenderError('PDF_RENDER_SIZE_UNSUPPORTED');
    }
    const { canvas, context } = createCanvas(width, height);
    if (!canvas || !context || typeof context.getImageData !== 'function') {
      throw new FiscalPdfRenderError('PDF_CANVAS_INVALID');
    }
    await page.render({ canvasContext: context, viewport, background: 'rgb(255,255,255)' }).promise;
    const pixels = context.getImageData(0, 0, width, height);
    return encodeFiscalRaster({ rgba: pixels.data, width, height, cut });
  } catch (error) {
    if (error instanceof FiscalPdfRenderError || error instanceof FiscalRasterError) throw error;
    throw new FiscalPdfRenderError('PDF_RENDER_FAILED');
  } finally {
    if (doc) await doc.destroy();
    else if (typeof task.destroy === 'function') await task.destroy();
  }
}
