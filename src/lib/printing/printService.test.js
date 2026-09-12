import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// printService debe consumir el PrinterProvider como abstracción -- para
// probarlo sin QZ Tray real, mockeamos qzTrayProvider (el único provider
// que printService conoce hoy).
const providerMock = {
  isAvailable: vi.fn(() => true),
  connect: vi.fn(() => Promise.resolve()),
  disconnect: vi.fn(() => Promise.resolve()),
  listPrinters: vi.fn(() => Promise.resolve(['Impresora A'])),
  print: vi.fn(() => Promise.resolve()),
};

vi.mock('./providers/qzTrayProvider', () => ({ qzTrayProvider: providerMock }));

const { printService } = await import('./printService');

beforeEach(() => {
  Object.values(providerMock).forEach((fn) => fn.mockClear());
});

describe('printService — fachada sobre PrinterProvider', () => {
  it('isAvailable/connect/disconnect/listPrinters delegan directo en el provider', async () => {
    expect(printService.isAvailable()).toBe(true);
    expect(providerMock.isAvailable).toHaveBeenCalledTimes(1);

    await printService.connect();
    expect(providerMock.connect).toHaveBeenCalledTimes(1);

    await printService.disconnect();
    expect(providerMock.disconnect).toHaveBeenCalledTimes(1);

    const printers = await printService.listPrinters();
    expect(printers).toEqual(['Impresora A']);
  });

  it('printReceipt renderiza el receipt a ESC/POS y lo envía al provider con la impresora indicada', async () => {
    const receipt = { lines: [{ text: 'hola' }], feedLines: 0, cut: false };
    await printService.printReceipt(receipt, { printerName: 'Impresora A' });

    expect(providerMock.print).toHaveBeenCalledTimes(1);
    const [printerName, data, options] = providerMock.print.mock.calls[0];
    expect(printerName).toBe('Impresora A');
    expect(data).toBeInstanceOf(Uint8Array);
    expect(Array.from(data.slice(0, 2))).toEqual([0x1B, 0x40]); // ESC @
    expect(options).toEqual({ copies: undefined });
  });

  it('printReceipt propaga options.copies al provider', async () => {
    await printService.printReceipt({ lines: [] }, { printerName: 'X', copies: 2 });
    const [, , options] = providerMock.print.mock.calls[0];
    expect(options).toEqual({ copies: 2 });
  });

  it('no contiene ninguna referencia a marca/modelo de impresora', () => {
    const source = readFileSync('src/lib/printing/printService.js', 'utf8').toLowerCase();
    expect(source).not.toContain('star');
    expect(source).not.toContain('tsp100');
    expect(source).not.toContain('epson');
  });
});
