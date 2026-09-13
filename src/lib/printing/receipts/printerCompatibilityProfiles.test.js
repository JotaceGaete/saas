import { describe, expect, it } from 'vitest';
import {
  COMPATIBILITY_PROFILES, DEFAULT_COMPATIBILITY_PROFILE_ID, getCompatibilityProfile,
  listCompatibilityProfiles, matchCompatibilityProfileId,
} from './printerCompatibilityProfiles';
import { GRAPHICS_STRATEGIES, CUT_STRATEGIES } from './escPosCapabilities';

// PRINT-5 — esta capa solo COMBINA capacidades ya validadas por separado
// (ver escPosCapabilities.js). Los tests confirman que cada perfil
// referencia ids de estrategia realmente existentes, que ninguno inventa
// una capacidad nueva, y que el perfil por defecto reproduce el
// comportamiento histórico validado en PRINT-4 (no un cambio de facto en
// el ticket por defecto).

describe('COMPATIBILITY_PROFILES', () => {
  it('expone exactamente los tres perfiles genéricos pedidos (generic80/compatibility80/textOnly80)', () => {
    expect(Object.keys(COMPATIBILITY_PROFILES).sort()).toEqual(['compatibility80', 'generic80', 'textOnly80']);
  });

  it('los tres perfiles son de 80mm -- Walinka no implementa 58mm en esta capa', () => {
    for (const profile of Object.values(COMPATIBILITY_PROFILES)) {
      expect(profile.paperWidthMm).toBe(80);
    }
  });

  it('cada perfil referencia un imageMode que existe realmente en GRAPHICS_STRATEGIES', () => {
    for (const profile of Object.values(COMPATIBILITY_PROFILES)) {
      expect(GRAPHICS_STRATEGIES[profile.imageMode]).toBeDefined();
    }
  });

  it('cada perfil referencia un cutStrategyId que existe realmente en CUT_STRATEGIES', () => {
    for (const profile of Object.values(COMPATIBILITY_PROFILES)) {
      expect(CUT_STRATEGIES[profile.cutStrategyId]).toBeDefined();
    }
  });

  it('ningún perfil ni etiqueta menciona una marca/modelo de impresora', () => {
    for (const profile of Object.values(COMPATIBILITY_PROFILES)) {
      const text = `${profile.label} ${profile.description}`.toLowerCase();
      expect(text).not.toContain('star');
      expect(text).not.toContain('tsp100');
      expect(text).not.toContain('epson');
    }
  });

  it('ninguna etiqueta/descripción menciona jerga ESC/POS (no debe llegar a una UI para usuarios normales)', () => {
    for (const profile of Object.values(COMPATIBILITY_PROFILES)) {
      const text = `${profile.label} ${profile.description}`.toLowerCase();
      expect(text).not.toContain('esc');
      expect(text).not.toContain('gs v');
      expect(text).not.toContain('escpos');
    }
  });

  describe('generic80 — "Recomendado"', () => {
    it('reproduce EXACTAMENTE el comportamiento validado en PRINT-4 (ESC *, corte moderno, logo activo, sin override de ancho)', () => {
      const profile = COMPATIBILITY_PROFILES.generic80;
      expect(profile.imageMode).toBe('bitImageEscStar');
      expect(profile.cutStrategyId).toBe('gs-v-modern');
      expect(profile.printLogo).toBe(true);
      expect(profile.autoCut).toBe(true);
      expect(profile.effectivePrintableWidthDots).toBeNull();
    });
  });

  describe('compatibility80 — "Compatibilidad"', () => {
    it('usa la estrategia de imagen y de corte alternativas (ya existentes, nunca nuevas)', () => {
      const profile = COMPATIBILITY_PROFILES.compatibility80;
      expect(profile.imageMode).toBe('rasterGsV0');
      expect(profile.cutStrategyId).toBe('gs-v-legacy');
      expect(profile.printLogo).toBe(true);
      expect(profile.autoCut).toBe(true);
    });
  });

  describe('textOnly80 — "Solo texto"', () => {
    it('desactiva el logo y no intenta ninguna estrategia de imagen', () => {
      const profile = COMPATIBILITY_PROFILES.textOnly80;
      expect(profile.imageMode).toBe('none');
      expect(profile.printLogo).toBe(false);
    });

    it('el corte queda configurable (no forzado a "none") -- una impresora puede no imprimir imagen y sí cortar bien', () => {
      const profile = COMPATIBILITY_PROFILES.textOnly80;
      expect(profile.autoCut).toBe(true);
      expect(profile.cutStrategyId).not.toBe('none');
    });
  });
});

describe('DEFAULT_COMPATIBILITY_PROFILE_ID / getCompatibilityProfile', () => {
  it('el default es generic80 ("Recomendado")', () => {
    expect(DEFAULT_COMPATIBILITY_PROFILE_ID).toBe('generic80');
    expect(getCompatibilityProfile(undefined)).toBe(COMPATIBILITY_PROFILES.generic80);
  });

  it('un id conocido devuelve ese perfil exacto', () => {
    expect(getCompatibilityProfile('compatibility80')).toBe(COMPATIBILITY_PROFILES.compatibility80);
    expect(getCompatibilityProfile('textOnly80')).toBe(COMPATIBILITY_PROFILES.textOnly80);
  });

  it('un id desconocido/inválido cae al default en vez de lanzar', () => {
    expect(getCompatibilityProfile('no-existe')).toBe(COMPATIBILITY_PROFILES.generic80);
    expect(getCompatibilityProfile(null)).toBe(COMPATIBILITY_PROFILES.generic80);
  });
});

describe('listCompatibilityProfiles', () => {
  it('devuelve los tres perfiles en el orden recomendado -> compatibilidad -> solo texto', () => {
    expect(listCompatibilityProfiles().map((p) => p.id)).toEqual(['generic80', 'compatibility80', 'textOnly80']);
  });
});

describe('matchCompatibilityProfileId — PRINT-5 (inferencia para configs guardadas antes de esta capa)', () => {
  it('una config sin profileId ni campos especiales infiere generic80', () => {
    expect(matchCompatibilityProfileId({ imageMode: 'bitImageEscStar', printLogo: true })).toBe('generic80');
  });

  it('una config con imageMode rasterGsV0 infiere compatibility80', () => {
    expect(matchCompatibilityProfileId({ imageMode: 'rasterGsV0', printLogo: true })).toBe('compatibility80');
  });

  it('una config con printLogo false infiere textOnly80, sin importar el imageMode guardado', () => {
    expect(matchCompatibilityProfileId({ imageMode: 'bitImageEscStar', printLogo: false })).toBe('textOnly80');
  });

  it('config vacía o null cae al default, nunca lanza', () => {
    expect(matchCompatibilityProfileId(null)).toBe('generic80');
    expect(matchCompatibilityProfileId({})).toBe('generic80');
  });

  it('nunca decide por el nombre de la impresora -- solo mira imageMode/printLogo', () => {
    expect(matchCompatibilityProfileId({ printerName: 'Star TSP100', imageMode: 'bitImageEscStar', printLogo: true })).toBe('generic80');
  });
});
