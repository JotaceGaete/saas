import { describe, it, expect, vi } from 'vitest';

vi.mock('./fetchLogoRaster', () => ({
  fetchLogoRaster: vi.fn(async () => ({ command: new Uint8Array([0x1b, 0x24, 0x40, 0x00, 0x1d, 0x76, 0x30, 0x00, 1, 0, 1, 0, 0xff]), width: 8, height: 1, xDots: 64 })),
}));

const { renderEscPosReceipt } = await import('./renderEscPosReceipt');

describe('logo seguido de texto centrado', () => {
  it('después del logo se reinicia la impresora (ESC @) antes de la línea siguiente', async () => {
    const bytes = Array.from(await renderEscPosReceipt({
      paperWidthMm: 80,
      lines: [{ type: 'logo', url: 'https://x/logo.png' }, { type: 'text', text: 'RUT 1', align: 'center', bold: true }],
    }));
    const raster = bytes.indexOf(0x76);
    const afterLogo = bytes.slice(raster);
    const lf = afterLogo.indexOf(0x0a);
    expect(afterLogo.slice(lf + 1, lf + 3)).toEqual([0x1b, 0x40]);
    // Y luego la línea centrada con su propia alineación.
    expect(afterLogo.slice(lf + 3, lf + 6)).toEqual([0x1b, 0x61, 0x01]);
  });
});
