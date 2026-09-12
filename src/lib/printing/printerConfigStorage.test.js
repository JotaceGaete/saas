/**
 * printerConfigStorage.js — mismo patrón de test que posTerminalDraftStorage.test.js.
 * localStorage está disponible en el entorno jsdom de Vitest.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  PRINTER_CONFIG_SCHEMA_VERSION,
  buildPrinterConfigKey,
  readPrinterConfig,
  writePrinterConfig,
} from './printerConfigStorage';

const DEFAULTS = {
  schemaVersion: PRINTER_CONFIG_SCHEMA_VERSION,
  printerName: null,
  paperWidthMm: 80,
  autoCut: true,
  printLogo: true,
  imageMode: 'bitImageEscStar',
};

beforeEach(() => {
  window.localStorage.clear();
});

describe('buildPrinterConfigKey', () => {
  it('genera una key namespaced por businessId', () => {
    expect(buildPrinterConfigKey('biz1')).toBe('walinka:printing:biz1');
  });

  it('businessId distinto produce una key distinta', () => {
    expect(buildPrinterConfigKey('biz1')).not.toBe(buildPrinterConfigKey('biz2'));
  });

  it('devuelve null si no hay businessId', () => {
    expect(buildPrinterConfigKey(null)).toBeNull();
    expect(buildPrinterConfigKey('')).toBeNull();
    expect(buildPrinterConfigKey(undefined)).toBeNull();
  });
});

describe('readPrinterConfig sin dato guardado', () => {
  it('devuelve defaults seguros: sin impresora, 80mm, autoCut y printLogo activados, imageMode bitImageEscStar', () => {
    const config = readPrinterConfig(buildPrinterConfigKey('biz-nuevo'));
    expect(config).toEqual(DEFAULTS);
  });

  it('devuelve defaults si la key es null (sin businessId)', () => {
    expect(readPrinterConfig(null)).toEqual(DEFAULTS);
  });
});

describe('write → read round-trip', () => {
  it('preserva printerName y paperWidthMm a través de write+read', () => {
    const key = buildPrinterConfigKey('biz1');
    writePrinterConfig(key, { printerName: 'Star TSP143', paperWidthMm: 80 });
    expect(readPrinterConfig(key)).toEqual({ ...DEFAULTS, printerName: 'Star TSP143' });
  });

  it('cada businessId tiene su propia configuración aislada', () => {
    writePrinterConfig(buildPrinterConfigKey('biz1'), { printerName: 'Impresora A', paperWidthMm: 80 });
    writePrinterConfig(buildPrinterConfigKey('biz2'), { printerName: 'Impresora B', paperWidthMm: 80 });
    expect(readPrinterConfig(buildPrinterConfigKey('biz1')).printerName).toBe('Impresora A');
    expect(readPrinterConfig(buildPrinterConfigKey('biz2')).printerName).toBe('Impresora B');
  });
});

describe('sanitización', () => {
  it('descarta printerName no-string y usa null', () => {
    const key = buildPrinterConfigKey('biz1');
    writePrinterConfig(key, { printerName: 12345, paperWidthMm: 80 });
    expect(readPrinterConfig(key).printerName).toBeNull();
  });

  it('descarta printerName vacío/solo espacios y usa null', () => {
    const key = buildPrinterConfigKey('biz1');
    writePrinterConfig(key, { printerName: '   ', paperWidthMm: 80 });
    expect(readPrinterConfig(key).printerName).toBeNull();
  });

  it('recorta espacios del printerName', () => {
    const key = buildPrinterConfigKey('biz1');
    writePrinterConfig(key, { printerName: '  Mi impresora  ', paperWidthMm: 80 });
    expect(readPrinterConfig(key).printerName).toBe('Mi impresora');
  });

  it('paperWidthMm inválido (negativo, NaN, no numérico) cae a default 80', () => {
    const key = buildPrinterConfigKey('biz1');
    writePrinterConfig(key, { printerName: 'X', paperWidthMm: -10 });
    expect(readPrinterConfig(key).paperWidthMm).toBe(80);
    writePrinterConfig(key, { printerName: 'X', paperWidthMm: 'ancho' });
    expect(readPrinterConfig(key).paperWidthMm).toBe(80);
    writePrinterConfig(key, { printerName: 'X', paperWidthMm: NaN });
    expect(readPrinterConfig(key).paperWidthMm).toBe(80);
  });

  it('no persiste campos desconocidos (no guarda información sensible ajena al esquema)', () => {
    const key = buildPrinterConfigKey('biz1');
    writePrinterConfig(key, { printerName: 'X', paperWidthMm: 80, apiKey: 'secreto', authToken: 'no-deberia-estar' });
    const stored = JSON.parse(window.localStorage.getItem(key));
    expect(stored).toEqual({ ...DEFAULTS, printerName: 'X' });
  });

  describe('PRINT-4 — autoCut', () => {
    it('por defecto (sin especificar) autoCut queda activado', () => {
      const key = buildPrinterConfigKey('biz1');
      writePrinterConfig(key, { printerName: 'X', paperWidthMm: 80 });
      expect(readPrinterConfig(key).autoCut).toBe(true);
    });

    it('autoCut: false se persiste y se respeta al leer', () => {
      const key = buildPrinterConfigKey('biz1');
      writePrinterConfig(key, { printerName: 'X', paperWidthMm: 80, autoCut: false });
      expect(readPrinterConfig(key).autoCut).toBe(false);
    });

    it('un valor no-booleano para autoCut cae al default (true), salvo que sea exactamente false', () => {
      const key = buildPrinterConfigKey('biz1');
      writePrinterConfig(key, { printerName: 'X', paperWidthMm: 80, autoCut: 'no' });
      expect(readPrinterConfig(key).autoCut).toBe(true);
    });
  });

  describe('PRINT-4-BUG3 — printLogo (reactivado por defecto: ESC * confirmado físicamente)', () => {
    it('por defecto (sin especificar) printLogo queda activado', () => {
      const key = buildPrinterConfigKey('biz1');
      writePrinterConfig(key, { printerName: 'X', paperWidthMm: 80 });
      expect(readPrinterConfig(key).printLogo).toBe(true);
    });

    it('printLogo: false se persiste y se respeta al leer (por si una impresora concreta no soporta ninguna variante)', () => {
      const key = buildPrinterConfigKey('biz1');
      writePrinterConfig(key, { printerName: 'X', paperWidthMm: 80, printLogo: false });
      expect(readPrinterConfig(key).printLogo).toBe(false);
    });

    it('un valor no-booleano para printLogo cae al default (true), salvo que sea exactamente false', () => {
      const key = buildPrinterConfigKey('biz1');
      writePrinterConfig(key, { printerName: 'X', paperWidthMm: 80, printLogo: 'no' });
      expect(readPrinterConfig(key).printLogo).toBe(true);
    });
  });

  describe('PRINT-4-BUG3 — imageMode (estrategia de comando gráfico ESC/POS)', () => {
    it('por defecto (sin especificar) usa bitImageEscStar (ESC *, confirmado físicamente)', () => {
      const key = buildPrinterConfigKey('biz1');
      writePrinterConfig(key, { printerName: 'X', paperWidthMm: 80 });
      expect(readPrinterConfig(key).imageMode).toBe('bitImageEscStar');
    });

    it('imageMode: rasterGsV0 se persiste y se respeta al leer (disponible para otras impresoras)', () => {
      const key = buildPrinterConfigKey('biz1');
      writePrinterConfig(key, { printerName: 'X', paperWidthMm: 80, imageMode: 'rasterGsV0' });
      expect(readPrinterConfig(key).imageMode).toBe('rasterGsV0');
    });

    it('un valor desconocido/inválido cae al default en vez de persistir basura', () => {
      const key = buildPrinterConfigKey('biz1');
      writePrinterConfig(key, { printerName: 'X', paperWidthMm: 80, imageMode: 'starPropietario' });
      expect(readPrinterConfig(key).imageMode).toBe('bitImageEscStar');
    });
  });

  it('write con config inválida (no objeto) no persiste nada', () => {
    const key = buildPrinterConfigKey('biz1');
    writePrinterConfig(key, null);
    expect(window.localStorage.getItem(key)).toBeNull();
  });
});

describe('tolerancia a localStorage corrupto', () => {
  it('JSON corrupto no lanza y devuelve defaults', () => {
    const key = buildPrinterConfigKey('biz1');
    window.localStorage.setItem(key, '{not-json');
    expect(() => readPrinterConfig(key)).not.toThrow();
    expect(readPrinterConfig(key)).toEqual(DEFAULTS);
  });

  it('un valor que no es un objeto JSON válido (array, string) no lanza y devuelve defaults', () => {
    const key = buildPrinterConfigKey('biz1');
    window.localStorage.setItem(key, '"solo un string"');
    expect(readPrinterConfig(key)).toEqual(DEFAULTS);

    window.localStorage.setItem(key, '[1,2,3]');
    expect(readPrinterConfig(key)).toEqual(DEFAULTS);
  });

  it('writePrinterConfig nunca lanza aunque localStorage.setItem falle', () => {
    const key = buildPrinterConfigKey('biz1');
    const original = window.localStorage.setItem.bind(window.localStorage);
    window.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
    try {
      expect(() => writePrinterConfig(key, { printerName: 'X', paperWidthMm: 80 })).not.toThrow();
    } finally {
      window.localStorage.setItem = original;
    }
  });

  it('readPrinterConfig nunca lanza aunque localStorage.getItem falle', () => {
    const key = buildPrinterConfigKey('biz1');
    const original = window.localStorage.getItem.bind(window.localStorage);
    window.localStorage.getItem = () => { throw new Error('boom'); };
    try {
      expect(() => readPrinterConfig(key)).not.toThrow();
      expect(readPrinterConfig(key)).toEqual(DEFAULTS);
    } finally {
      window.localStorage.getItem = original;
    }
  });
});
