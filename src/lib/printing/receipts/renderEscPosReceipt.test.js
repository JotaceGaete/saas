import { describe, expect, it } from 'vitest';
import { renderEscPosReceipt, buildTestReceipt } from './renderEscPosReceipt';

const ESC = 0x1B;
const GS = 0x1D;

function bytesToText(bytes) {
  return Array.from(bytes).map((b) => (b < 256 ? String.fromCharCode(b) : '?')).join('');
}

function includesSubsequence(bytes, seq) {
  const arr = Array.from(bytes);
  for (let i = 0; i <= arr.length - seq.length; i++) {
    if (seq.every((v, j) => arr[i + j] === v)) return true;
  }
  return false;
}

describe('renderEscPosReceipt', () => {
  it('empieza con el comando de inicialización ESC @', () => {
    const bytes = renderEscPosReceipt({ lines: [{ text: 'hola' }] });
    expect(Array.from(bytes.slice(0, 2))).toEqual([ESC, 0x40]);
  });

  it('termina con avance de papel y corte GS V 0 cuando cut !== false', () => {
    const bytes = renderEscPosReceipt({ lines: [{ text: 'hola' }], feedLines: 2, cut: true });
    const tail = Array.from(bytes.slice(-3));
    expect(tail).toEqual([GS, 0x56, 0x00]); // GS V 0 -- corte total, al final de todo
    expect(bytes[bytes.length - 4]).toBe(0x0A); // precedido por avance de papel
  });

  it('no agrega el comando de corte cuando cut === false', () => {
    const bytes = renderEscPosReceipt({ lines: [{ text: 'hola' }], feedLines: 0, cut: false });
    expect(includesSubsequence(bytes, [GS, 0x56])).toBe(false);
  });

  it('incluye el texto de cada línea', () => {
    const bytes = renderEscPosReceipt({ lines: [{ text: 'Ticket de prueba' }], feedLines: 0, cut: false });
    expect(bytesToText(bytes)).toContain('Ticket de prueba');
  });

  it('envuelve una línea en negrita con ESC E 1 / ESC E 0', () => {
    const bytes = renderEscPosReceipt({ lines: [{ text: 'bold', bold: true }], feedLines: 0, cut: false });
    expect(includesSubsequence(bytes, [ESC, 0x45, 0x01])).toBe(true);
    expect(includesSubsequence(bytes, [ESC, 0x45, 0x00])).toBe(true);
  });

  it('envuelve una línea centrada con ESC a 1 y vuelve a ESC a 0 en la siguiente', () => {
    const bytes = renderEscPosReceipt({
      lines: [{ text: 'centro', align: 'center' }, { text: 'izquierda' }],
      feedLines: 0, cut: false,
    });
    expect(includesSubsequence(bytes, [ESC, 0x61, 0x01])).toBe(true);
    expect(includesSubsequence(bytes, [ESC, 0x61, 0x00])).toBe(true);
  });

  it('reemplaza caracteres fuera de Latin-1 por "?" en vez de bytes UTF-8 crudos', () => {
    const bytes = renderEscPosReceipt({ lines: [{ text: '你好' }], feedLines: 0, cut: false });
    const text = bytesToText(bytes);
    expect(text).toContain('??');
  });

  it('devuelve un Uint8Array', () => {
    const bytes = renderEscPosReceipt({ lines: [{ text: 'x' }] });
    expect(bytes).toBeInstanceOf(Uint8Array);
  });

  it('sin lines no lanza y produce igual init + feed/corte', () => {
    expect(() => renderEscPosReceipt({})).not.toThrow();
    const bytes = renderEscPosReceipt({});
    expect(Array.from(bytes.slice(0, 2))).toEqual([ESC, 0x40]);
  });
});

describe('buildTestReceipt', () => {
  it('usa el nombre de la impresora y el ancho de papel en el contenido', () => {
    const receipt = buildTestReceipt({ businessName: 'Mi Negocio', printerName: 'Star TSP143', paperWidthMm: 80 });
    const allText = receipt.lines.map((l) => l.text).join('\n');
    expect(allText).toContain('Star TSP143');
    expect(allText).toContain('80 mm');
  });

  it('indica "no seleccionada" si no hay impresora', () => {
    const receipt = buildTestReceipt({ businessName: 'Mi Negocio', printerName: '', paperWidthMm: 80 });
    const allText = receipt.lines.map((l) => l.text).join('\n');
    expect(allText).toContain('no seleccionada');
  });

  it('no depende de ningún nombre de marca/modelo de impresora', () => {
    const receipt = buildTestReceipt({ businessName: 'Mi Negocio', printerName: 'Cualquier impresora ESC/POS', paperWidthMm: 80 });
    const allText = receipt.lines.map((l) => l.text).join('\n').toLowerCase();
    expect(allText).not.toContain('star');
    expect(allText).not.toContain('tsp100');
    expect(allText).not.toContain('epson');
  });

  it('los separadores son más largos a 80mm que a 58mm', () => {
    const dividerLength = (receipt) => receipt.lines.find((l) => /^-+$/.test(l.text))?.text.length || 0;
    const at80 = buildTestReceipt({ paperWidthMm: 80 });
    const at58 = buildTestReceipt({ paperWidthMm: 58 });
    expect(dividerLength(at80)).toBeGreaterThan(dividerLength(at58));
  });

  it('siempre pide corte', () => {
    const receipt = buildTestReceipt();
    expect(receipt.cut).toBe(true);
  });

  it('el receipt es serializable a ESC/POS sin lanzar', () => {
    const receipt = buildTestReceipt({ businessName: 'Ñuñoa Panadería', printerName: 'X', paperWidthMm: 80 });
    expect(() => renderEscPosReceipt(receipt)).not.toThrow();
  });
});
