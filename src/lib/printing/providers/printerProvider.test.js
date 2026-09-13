import { describe, expect, it } from 'vitest';
import { assertPrinterProvider } from './printerProvider';

const completeProvider = {
  isAvailable: () => true,
  connect: () => Promise.resolve(),
  disconnect: () => Promise.resolve(),
  listPrinters: () => Promise.resolve([]),
  print: () => Promise.resolve(),
};

describe('assertPrinterProvider', () => {
  it('devuelve el provider tal cual si implementa los 5 métodos', () => {
    expect(assertPrinterProvider(completeProvider)).toBe(completeProvider);
  });

  it('lanza si falta algún método requerido', () => {
    const { print, ...incomplete } = completeProvider;
    expect(() => assertPrinterProvider(incomplete)).toThrow(/print/);
  });

  it('lanza con un mensaje que lista todos los métodos faltantes', () => {
    expect(() => assertPrinterProvider({ isAvailable: () => true })).toThrow(/connect, disconnect, listPrinters, print/);
  });

  it('lanza si se pasa undefined/null', () => {
    expect(() => assertPrinterProvider(undefined)).toThrow();
    expect(() => assertPrinterProvider(null)).toThrow();
  });
});
