import { describe, expect, it } from 'vitest';
import {
  PRINTER_PROFILES, getPrinterProfile, getEffectivePrintableWidthDots, getColumnsForProfile, getLogoMaxWidthDots,
  buildLayout,
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

// PRINT-4-BUG10 — `getLogoMaxWidthDots` pasa a derivarse de
// `profile.effectivePrintableWidthDots` (el ancho REAL calibrado
// físicamente para imágenes, ver PRINT-4-BUG9/BUG10), NO de
// `getEffectivePrintableWidthDots` (ese es el ancho de CONTENIDO DE TEXTO,
// un concepto distinto -- ver comentario de archivo en printerProfile.js).
describe('getLogoMaxWidthDots', () => {
  it('nunca es el 100% de effectivePrintableWidthDots -- deja margen visible a los costados', () => {
    const profile = PRINTER_PROFILES[80];
    const logoMax = getLogoMaxWidthDots(profile);
    expect(logoMax).toBeLessThan(profile.effectivePrintableWidthDots);
  });

  it('usa exactamente la fracción configurada (0.70) sobre effectivePrintableWidthDots, no sobre el ancho de contenido de texto', () => {
    const profile = PRINTER_PROFILES[80];
    const logoMax = getLogoMaxWidthDots(profile);
    expect(logoMax).toBe(Math.round(profile.effectivePrintableWidthDots * 0.70));
    // asegura que NO se está usando por error el ancho de contenido de texto
    // (un valor distinto, casi siempre mayor a effectivePrintableWidthDots)
    expect(logoMax).not.toBe(Math.round(getEffectivePrintableWidthDots(profile) * 0.70));
  });

  it('nunca excede 0.70 -- no subir la fracción sin una nueva validación física que lo confirme (tolerancia de +-1 dot por redondeo)', () => {
    for (const profile of Object.values(PRINTER_PROFILES)) {
      const logoMax = getLogoMaxWidthDots(profile);
      expect(logoMax).toBeLessThanOrEqual(Math.round(profile.effectivePrintableWidthDots * 0.70) + 1);
    }
  });

  it('sin effectivePrintableWidthDots configurado, cae al ancho de contenido de texto (compatibilidad hacia atrás)', () => {
    const profile = { printableWidthDots: 500, safeMarginDots: 20, logoMaxWidthFraction: 0.70 };
    const fallbackContentWidth = getEffectivePrintableWidthDots(profile);
    expect(getLogoMaxWidthDots(profile)).toBe(Math.round(fallbackContentWidth * 0.70));
  });

  it('logo nunca excede effectivePrintableWidthDots (nunca el ancho nominal completo del papel)', () => {
    for (const profile of Object.values(PRINTER_PROFILES)) {
      const logoMax = getLogoMaxWidthDots(profile);
      expect(logoMax).toBeLessThanOrEqual(profile.effectivePrintableWidthDots);
    }
  });
});

// PRINT-4-BUG5 — `buildLayout` es el objeto único del que TODO el
// renderer debe leer: estos tests confirman su forma exacta y las
// invariantes pedidas explícitamente (contentWidthDots derivado del
// margen, doubleWidthCharsPerLine derivado de normalCharsPerLine DESPUÉS
// de calcularlo -- nunca al revés -- y el logo siempre por debajo de la
// fracción configurada del ancho de contenido).
describe('buildLayout', () => {
  it('devuelve exactamente las claves de PrintLayout, ninguna de más ni de menos', () => {
    const layout = buildLayout(80);
    expect(Object.keys(layout).sort()).toEqual([
      'contentWidthDots',
      'doubleWidthCharsPerLine',
      'effectivePrintableWidthDots',
      'logoMaxWidthDots',
      'normalCharsPerLine',
      'paperWidthMm',
      'printableWidthDots',
      'safeMarginDots',
    ].sort());
  });

  it('contentWidthDots = printableWidthDots - 2*safeMarginDots', () => {
    for (const paperWidthMm of [80, 58]) {
      const layout = buildLayout(paperWidthMm);
      expect(layout.contentWidthDots).toBe(layout.printableWidthDots - 2 * layout.safeMarginDots);
    }
  });

  it('doubleWidthCharsPerLine = floor(normalCharsPerLine / 2) -- se deriva DESPUÉS de calcular el ancho normal, nunca al revés', () => {
    for (const paperWidthMm of [80, 58]) {
      const layout = buildLayout(paperWidthMm);
      expect(layout.doubleWidthCharsPerLine).toBe(Math.floor(layout.normalCharsPerLine / 2));
    }
  });

  it('logoMaxWidthDots nunca excede el 70% de effectivePrintableWidthDots (tolerancia de redondeo) y nunca llega al 100%', () => {
    for (const paperWidthMm of [80, 58]) {
      const layout = buildLayout(paperWidthMm);
      expect(layout.logoMaxWidthDots).toBeLessThanOrEqual(Math.ceil(layout.effectivePrintableWidthDots * 0.70));
      expect(layout.logoMaxWidthDots).toBeLessThan(layout.effectivePrintableWidthDots);
    }
  });

  // PRINT-4-BUG10 — `effectivePrintableWidthDots` es el ancho REAL
  // calibrado físicamente (ver PRINT-4-BUG9/BUG10) dentro del cual una
  // imagen puede posicionarse con `ESC $` sin recortarse -- un concepto
  // DISTINTO de `contentWidthDots` (ese es para texto). Reemplaza el
  // margen horneado en píxeles (`logoLeftMarginDots`, BUG6) que la prueba
  // física de BUG8 descartó por completo.
  it('effectivePrintableWidthDots nunca excede printableWidthDots (nunca más ancho que el nominal)', () => {
    for (const paperWidthMm of [80, 58]) {
      const layout = buildLayout(paperWidthMm);
      expect(layout.effectivePrintableWidthDots).toBeLessThanOrEqual(layout.printableWidthDots);
    }
  });

  it('a 80mm, effectivePrintableWidthDots coincide con el placeholder calibrado por evidencia física de BUG9 (286, pendiente de calibración exacta)', () => {
    const layout = buildLayout(80);
    expect(layout.effectivePrintableWidthDots).toBe(286);
  });

  it('effectivePrintableWidthDots viene del perfil, no se recalcula de forma independiente en buildLayout', () => {
    for (const paperWidthMm of [80, 58]) {
      const layout = buildLayout(paperWidthMm);
      const profile = getPrinterProfile(paperWidthMm);
      expect(layout.effectivePrintableWidthDots).toBe(profile.effectivePrintableWidthDots);
    }
  });

  it('normalCharsPerLine coincide con getColumnsForProfile del mismo perfil -- una sola fuente de verdad, no dos cálculos paralelos', () => {
    for (const paperWidthMm of [80, 58]) {
      const layout = buildLayout(paperWidthMm);
      const profile = getPrinterProfile(paperWidthMm);
      expect(layout.normalCharsPerLine).toBe(getColumnsForProfile(profile));
    }
  });

  it('paperWidthMm desconocido cae al perfil de 80mm, igual que getPrinterProfile', () => {
    expect(buildLayout(999).paperWidthMm).toBe(80);
  });
});
