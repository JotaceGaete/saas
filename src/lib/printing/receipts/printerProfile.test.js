import { describe, expect, it } from 'vitest';
import {
  PRINTER_PROFILES, getPrinterProfile, getEffectivePrintableWidthDots, getColumnsForProfile, getLogoMaxWidthDots,
} from './printerProfile';

// PRINT-4-BUG4 — este módulo es la única fuente de verdad sobre "cuánto
// espacio hay de verdad" (ancho de papel != ancho imprimible). Los tests
// confirman que columnas de texto y ancho máximo del logo se derivan del
// MISMO perfil (nunca dos tablas independientes desincronizadas), que el
// margen de seguridad realmente resta espacio, y que el logo nunca usa
// el 100% del ancho disponible.

describe('getPrinterProfile', () => {
  it('devuelve un perfil conocido para 80 y 58mm', () => {
    expect(getPrinterProfile(80).paperWidthMm).toBe(80);
    expect(getPrinterProfile(58).paperWidthMm).toBe(58);
  });

  it('un ancho de papel desconocido cae al perfil de 80mm (nunca lanza)', () => {
    expect(getPrinterProfile(112).paperWidthMm).toBe(80);
    expect(getPrinterProfile(undefined).paperWidthMm).toBe(80);
  });

  it('el perfil de 80mm usa un ancho nominal conservador, menor al máximo teórico de hoja de datos (576 dots/72mm)', () => {
    expect(PRINTER_PROFILES[80].printableWidthDots).toBeLessThan(576);
  });
});

describe('getEffectivePrintableWidthDots', () => {
  it('resta el margen de seguridad de AMBOS lados', () => {
    const profile = { printableWidthDots: 500, safeMarginDots: 20 };
    expect(getEffectivePrintableWidthDots(profile)).toBe(500 - 20 * 2);
  });

  it('nunca es menor a 1 aunque el margen sea absurdamente grande', () => {
    const profile = { printableWidthDots: 10, safeMarginDots: 1000 };
    expect(getEffectivePrintableWidthDots(profile)).toBeGreaterThanOrEqual(1);
  });

  it('sin margen configurado, el ancho efectivo es el nominal completo', () => {
    const profile = { printableWidthDots: 500 };
    expect(getEffectivePrintableWidthDots(profile)).toBe(500);
  });
});

describe('getColumnsForProfile', () => {
  it('se deriva del ancho EFECTIVO (ya con margen descontado), no del nominal', () => {
    const profile = { printableWidthDots: 500, safeMarginDots: 20, dotsPerChar: 12 };
    const expectedColumns = Math.floor((500 - 40) / 12);
    expect(getColumnsForProfile(profile)).toBe(expectedColumns);
  });

  it('el perfil de 80mm da menos columnas que el ancho de línea nominal / 12 -- el margen realmente descuenta espacio', () => {
    const profile80 = PRINTER_PROFILES[80];
    const columns = getColumnsForProfile(profile80);
    const columnsSinMargen = Math.floor(profile80.printableWidthDots / profile80.dotsPerChar);
    expect(columns).toBeLessThan(columnsSinMargen);
  });

  it('80mm tiene más columnas que 58mm', () => {
    expect(getColumnsForProfile(PRINTER_PROFILES[80])).toBeGreaterThan(getColumnsForProfile(PRINTER_PROFILES[58]));
  });
});

describe('getLogoMaxWidthDots', () => {
  it('nunca es el 100% del ancho efectivo -- deja margen visible a los costados', () => {
    const profile = PRINTER_PROFILES[80];
    const effective = getEffectivePrintableWidthDots(profile);
    const logoMax = getLogoMaxWidthDots(profile);
    expect(logoMax).toBeLessThan(effective);
  });

  it('cae dentro del rango pedido (80-85% del ancho efectivo)', () => {
    const profile = PRINTER_PROFILES[80];
    const effective = getEffectivePrintableWidthDots(profile);
    const logoMax = getLogoMaxWidthDots(profile);
    expect(logoMax / effective).toBeGreaterThanOrEqual(0.78);
    expect(logoMax / effective).toBeLessThanOrEqual(0.86);
  });

  it('logo + márgenes nunca exceden el ancho imprimible nominal declarado', () => {
    for (const profile of Object.values(PRINTER_PROFILES)) {
      const logoMax = getLogoMaxWidthDots(profile);
      const totalWithMargins = logoMax + profile.safeMarginDots * 2;
      expect(totalWithMargins).toBeLessThanOrEqual(profile.printableWidthDots);
    }
  });
});
