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

describe('getLogoMaxWidthDots', () => {
  it('nunca es el 100% del ancho efectivo -- deja margen visible a los costados', () => {
    const profile = PRINTER_PROFILES[80];
    const effective = getEffectivePrintableWidthDots(profile);
    const logoMax = getLogoMaxWidthDots(profile);
    expect(logoMax).toBeLessThan(effective);
  });

  it('usa exactamente la fracción configurada (BUG6: 0.70, bajada de 0.78 en BUG5 -- la prueba física siguió mostrando el logo cortado)', () => {
    const profile = PRINTER_PROFILES[80];
    const effective = getEffectivePrintableWidthDots(profile);
    const logoMax = getLogoMaxWidthDots(profile);
    expect(logoMax).toBe(Math.round(effective * 0.70));
  });

  it('nunca excede 0.70 -- no subir la fracción sin una nueva validación física que lo confirme (tolerancia de +-1 dot por redondeo)', () => {
    for (const profile of Object.values(PRINTER_PROFILES)) {
      const effective = getEffectivePrintableWidthDots(profile);
      const logoMax = getLogoMaxWidthDots(profile);
      expect(logoMax).toBeLessThanOrEqual(Math.round(effective * 0.70) + 1);
    }
  });

  it('logo + márgenes nunca exceden el ancho imprimible nominal declarado', () => {
    for (const profile of Object.values(PRINTER_PROFILES)) {
      const logoMax = getLogoMaxWidthDots(profile);
      const totalWithMargins = logoMax + profile.safeMarginDots * 2;
      expect(totalWithMargins).toBeLessThanOrEqual(profile.printableWidthDots);
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
      'logoLeftMarginDots',
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

  it('logoMaxWidthDots nunca excede el 70% de contentWidthDots (tolerancia de redondeo) y nunca llega al 100%', () => {
    for (const paperWidthMm of [80, 58]) {
      const layout = buildLayout(paperWidthMm);
      expect(layout.logoMaxWidthDots).toBeLessThanOrEqual(Math.ceil(layout.contentWidthDots * 0.70));
      expect(layout.logoMaxWidthDots).toBeLessThan(layout.contentWidthDots);
    }
  });

  // PRINT-4-BUG6 — `logoLeftMarginDots` es el margen izquierdo EXPLÍCITO
  // (medido desde la posición física 0 del cabezal) que renderEscPosReceipt
  // pasa a fetchLogoRaster para hornearlo en el bitmap -- ver
  // escPosImage.js#padBitsLeft. La invariante pedida explícitamente por el
  // encargo es logoLeftMarginDots + logoMaxWidthDots <= printableWidthDots
  // - safeMarginDots (nunca cruza el margen de seguridad derecho).
  it('logoLeftMarginDots + logoMaxWidthDots nunca excede printableWidthDots - safeMarginDots', () => {
    for (const paperWidthMm of [80, 58]) {
      const layout = buildLayout(paperWidthMm);
      expect(layout.logoLeftMarginDots + layout.logoMaxWidthDots).toBeLessThanOrEqual(layout.printableWidthDots - layout.safeMarginDots);
    }
  });

  it('logoLeftMarginDots nunca es menor al margen de seguridad izquierdo', () => {
    for (const paperWidthMm of [80, 58]) {
      const layout = buildLayout(paperWidthMm);
      expect(layout.logoLeftMarginDots).toBeGreaterThanOrEqual(layout.safeMarginDots);
    }
  });

  it('centra la caja del logo dentro de contentWidthDots: logoLeftMarginDots = safeMarginDots + floor((contentWidthDots - logoMaxWidthDots) / 2)', () => {
    for (const paperWidthMm of [80, 58]) {
      const layout = buildLayout(paperWidthMm);
      const expected = layout.safeMarginDots + Math.floor((layout.contentWidthDots - layout.logoMaxWidthDots) / 2);
      expect(layout.logoLeftMarginDots).toBe(expected);
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
