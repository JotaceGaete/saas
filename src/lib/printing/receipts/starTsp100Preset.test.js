import { describe, it, expect } from 'vitest';
import {
  COMPATIBILITY_PROFILES,
  PRESET_PROFILES,
  PRINTER_PROFILE_PRESETS,
  getPresetProfileIdForPrinter,
  getCompatibilityProfile,
  listCompatibilityProfiles,
} from './printerCompatibilityProfiles';
import { buildSaleReceipt } from './buildSaleReceipt';
import { readPrinterConfig, writePrinterConfig, buildPrinterConfigKey } from '../printerConfigStorage';

const STAR_QUEUE = 'Star TSP100 Cutter (TSP143)';

describe('perfil Star TSP100IIU (PRINT-6)', () => {
  it('el perfil starTsp100 es texto + corte sin logo, con GS V 66 0', () => {
    const p = PRESET_PROFILES.starTsp100;
    expect(p.imageMode).toBe('none');
    expect(p.printLogo).toBe(false);
    expect(p.autoCut).toBe(true);
    expect(p.cutStrategyId).toBe('gs-v-modern');
  });

  it('solo la cola exacta de la Star tiene preset', () => {
    expect(PRINTER_PROFILE_PRESETS[STAR_QUEUE]).toBe('generic80');
    expect(getPresetProfileIdForPrinter(STAR_QUEUE)).toBe('generic80');
    expect(getPresetProfileIdForPrinter('Star TSP100 Cutter (TSP143) copia')).toBeNull();
    expect(getPresetProfileIdForPrinter('XP-80C')).toBeNull();
    expect(getPresetProfileIdForPrinter('')).toBeNull();
    expect(getPresetProfileIdForPrinter(null)).toBeNull();
  });

  it('el preset se resuelve por nombre exacto, sin prototipos heredados', () => {
    expect(getPresetProfileIdForPrinter('constructor')).toBeNull();
    expect(getPresetProfileIdForPrinter('__proto__')).toBeNull();
  });

  it('el Recomendado, Compatibilidad y Solo texto no cambian', () => {
    expect(COMPATIBILITY_PROFILES.generic80.imageMode).toBe('bitImageEscStar');
    expect(COMPATIBILITY_PROFILES.generic80.printLogo).toBe(true);
    expect(COMPATIBILITY_PROFILES.compatibility80.imageMode).toBe('rasterGsV0');
    expect(COMPATIBILITY_PROFILES.textOnly80.printLogo).toBe(false);
    expect(getCompatibilityProfile('desconocido').id).toBe('generic80');
  });

  it('el perfil de preset no aparece en la lista general de modos', () => {
    const ids = listCompatibilityProfiles().map((p) => p.id);
    expect(ids).toEqual(['generic80', 'compatibility80', 'textOnly80']);
  });

  it('el perfil de preset se resuelve por id sin entrar en los modos genéricos', () => {
    expect(getCompatibilityProfile('starTsp100').id).toBe('starTsp100');
    expect(COMPATIBILITY_PROFILES.starTsp100).toBeUndefined();
  });

  it('una config guardada con starTsp100 se lee sin degradarse a generic80', () => {
    const storage = new Map();
    const fakeWindow = { localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) } };
    globalThis.window = fakeWindow;
    try {
      const key = buildPrinterConfigKey('biz-1');
      writePrinterConfig(key, { printerName: STAR_QUEUE, profileId: 'starTsp100', imageMode: 'none', printLogo: false, cutStrategyId: 'gs-v-modern', autoCut: true });
      const back = readPrinterConfig(key);
      expect(back.profileId).toBe('starTsp100');
      expect(back.printLogo).toBe(false);
    } finally {
      delete globalThis.window;
    }
  });

  it('la Star recibe el perfil Recomendado: el logo no se pierde', () => {
    const profile = getCompatibilityProfile(getPresetProfileIdForPrinter(STAR_QUEUE));
    expect(profile.id).toBe('generic80');
    expect(profile.printLogo).toBe(true);
    expect(profile.cutStrategyId).toBe('gs-v-modern');
  });

  it('(perfil sin logo, solo texto y corte, queda disponible como preset interno)', () => {
    expect(PRESET_PROFILES.starTsp100.printLogo).toBe(false);
  });

  it('un ticket de venta con el perfil Star no incluye logo y pide corte GS V 66 0 con 4 LF', () => {
    const receipt = buildSaleReceipt({
      business: { name: 'Prueba', logoUrl: 'https://ejemplo.invalid/logo.png' },
      items: [{ name: 'Producto', quantity: 1, unitPrice: 1000 }],
      total: 1000,
      printLogo: false,
      imageMode: 'none',
      cutStrategyId: 'gs-v-modern',
      autoCut: true,
    });
    expect(receipt.lines.some((l) => l.type === 'logo')).toBe(false);
    expect(receipt.cut).toBe(true);
    expect(receipt.cutStrategyId).toBe('gs-v-modern');
    expect(receipt.feedLines).toBe(4);
  });
});
