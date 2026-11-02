import { describe, it, expect, vi } from 'vitest';
import { renderFiscalPdf80ToEscPos } from './pdf80Renderer';

const pdf = () => new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
const pageWidth = 80 * 72 / 25.4;
function harness({ pages = 1, width = pageWidth, height = 150 } = {}) {
  const destroy = vi.fn(async () => {});
  const render = vi.fn(() => ({ promise: Promise.resolve() }));
  const getPage = vi.fn(async () => ({
    getViewport: ({ scale }) => ({ width: width * scale, height: height * scale }),
    render,
  }));
  const pdfjsLib = { getDocument: vi.fn(() => ({ promise: Promise.resolve({ numPages: pages, getPage, destroy }) })) };
  const createCanvas = vi.fn((w, h) => ({
    canvas: { width: w, height: h },
    context: { getImageData: () => ({ data: new Uint8ClampedArray(w * h * 4).fill(255) }) },
  }));
  return { pdfjsLib, createCanvas, destroy, render };
}

describe('renderFiscalPdf80ToEscPos', () => {
  it('convierte un PDF 80mm ya emitido en ESC/POS sin emitir', async () => {
    const h = harness();
    const result = await renderFiscalPdf80ToEscPos({ pdfBytes: pdf(), ...h });
    expect(Array.from(result.slice(0, 2))).toEqual([27, 64]);
    expect(h.pdfjsLib.getDocument).toHaveBeenCalledTimes(1);
    expect(h.render).toHaveBeenCalledTimes(1);
    expect(h.destroy).toHaveBeenCalledTimes(1);
  });
  it('rechaza PDF de varias páginas', async () => {
    const h = harness({ pages: 2 });
    await expect(renderFiscalPdf80ToEscPos({ pdfBytes: pdf(), ...h })).rejects.toThrow('PDF_PAGE_COUNT_UNSUPPORTED');
    expect(h.destroy).toHaveBeenCalledTimes(1);
  });
  it('rechaza papel carta', async () => {
    const h = harness({ width: 612 });
    await expect(renderFiscalPdf80ToEscPos({ pdfBytes: pdf(), ...h })).rejects.toThrow('PDF_PAPER_WIDTH_NOT_80MM');
  });
  it('rechaza motor ausente y anchos inválidos', async () => {
    await expect(renderFiscalPdf80ToEscPos({ pdfBytes: pdf() })).rejects.toThrow('PDF_RENDERER_NOT_CONFIGURED');
    const h = harness();
    await expect(renderFiscalPdf80ToEscPos({ pdfBytes: pdf(), ...h, printableWidthDots: 900 })).rejects.toThrow('PRINTER_WIDTH_INVALID');
  });
});
