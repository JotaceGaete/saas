/**
 * supabasePublishableKey — batería de tests unitarios
 * Ejecutar: npx vitest run supabase/functions/_shared/supabasePublishableKey.test.ts
 *
 * Testea únicamente resolveSupabasePublishableKey() (lógica pura) -- nunca
 * getSupabasePublishableKey() (toca `Deno.env`, no existe en Vitest/Node).
 * Todos los valores usados son strings ficticios, nunca claves reales.
 */

import { describe, it, expect } from 'vitest';
import { resolveSupabasePublishableKey } from './supabasePublishableKey';
// Vite `?raw` import: contenido crudo del archivo como string, sin resolver
// módulos -- evita depender de fs/import.meta.url bajo el transform de Vitest.
import supabasePublishableKeySource from './supabasePublishableKey.ts?raw';

const FAKE_HOSTED_KEY = 'sb_publishable_test_123';
const FAKE_LOCAL_KEY = 'sb_publishable_local_test_456';
const FAKE_LEGACY_KEY = 'eyJfake.legacy.jwt.test789';

const EMPTY_ENV = { publishableKeysRaw: undefined, localPublishableKey: undefined, legacyAnonKey: undefined };

describe('resolveSupabasePublishableKey — hosted SUPABASE_PUBLISHABLE_KEYS presente', () => {
  it('devuelve la key "default" desde SUPABASE_PUBLISHABLE_KEYS cuando está bien formada', () => {
    const result = resolveSupabasePublishableKey({
      ...EMPTY_ENV,
      publishableKeysRaw: JSON.stringify({ default: FAKE_HOSTED_KEY }),
    });
    expect(result).toBe(FAKE_HOSTED_KEY);
  });

  it('permite pedir una key con nombre distinto de "default"', () => {
    const result = resolveSupabasePublishableKey(
      { ...EMPTY_ENV, publishableKeysRaw: JSON.stringify({ default: FAKE_HOSTED_KEY, mobile: 'sb_publishable_mobile_999' }) },
      'mobile',
    );
    expect(result).toBe('sb_publishable_mobile_999');
  });
});

describe('resolveSupabasePublishableKey — SUPABASE_PUBLISHABLE_KEYS mal formado', () => {
  it('JSON inválido → error controlado (no cae al legacy en silencio)', () => {
    expect(() =>
      resolveSupabasePublishableKey({
        ...EMPTY_ENV,
        publishableKeysRaw: '{not valid json',
        legacyAnonKey: FAKE_LEGACY_KEY, // presente, pero NO debe usarse
      }),
    ).toThrowError(/SUPABASE_PUBLISHABLE_KEYS_INVALID_JSON/);
  });

  it('JSON válido pero no es un objeto (array) → error controlado', () => {
    expect(() =>
      resolveSupabasePublishableKey({ ...EMPTY_ENV, publishableKeysRaw: '["not", "an", "object"]', legacyAnonKey: FAKE_LEGACY_KEY }),
    ).toThrowError(/SUPABASE_PUBLISHABLE_KEYS_INVALID_SHAPE/);
  });

  it('JSON válido pero primitivo (string) → error controlado', () => {
    expect(() =>
      resolveSupabasePublishableKey({ ...EMPTY_ENV, publishableKeysRaw: '"just a string"', legacyAnonKey: FAKE_LEGACY_KEY }),
    ).toThrowError(/SUPABASE_PUBLISHABLE_KEYS_INVALID_SHAPE/);
  });

  it('objeto sin la key "default" → error controlado', () => {
    expect(() =>
      resolveSupabasePublishableKey({
        ...EMPTY_ENV,
        publishableKeysRaw: JSON.stringify({ mobile: 'sb_publishable_mobile_999' }),
        legacyAnonKey: FAKE_LEGACY_KEY, // presente, pero NO debe usarse
      }),
    ).toThrowError(/SUPABASE_PUBLISHABLE_KEYS_MISSING_KEY/);
  });

  it('objeto con "default" vacío → error controlado, igual que ausente', () => {
    expect(() =>
      resolveSupabasePublishableKey({ ...EMPTY_ENV, publishableKeysRaw: JSON.stringify({ default: '' }) }),
    ).toThrowError(/SUPABASE_PUBLISHABLE_KEYS_MISSING_KEY/);
  });

  it('un SUPABASE_PUBLISHABLE_KEYS roto NUNCA hace fallback silencioso al legacy, aunque el legacy esté disponible', () => {
    try {
      resolveSupabasePublishableKey({ ...EMPTY_ENV, publishableKeysRaw: '{"other":"x"}', legacyAnonKey: FAKE_LEGACY_KEY });
      expect.fail('debería haber lanzado');
    } catch (err) {
      expect((err as Error).message).not.toContain(FAKE_LEGACY_KEY);
      expect((err as Error).message).toMatch(/SUPABASE_PUBLISHABLE_KEYS_MISSING_KEY/);
    }
  });
});

describe('resolveSupabasePublishableKey — variante local de desarrollo', () => {
  it('usa SUPABASE_PUBLISHABLE_KEY (singular) cuando SUPABASE_PUBLISHABLE_KEYS no está definida', () => {
    const result = resolveSupabasePublishableKey({ ...EMPTY_ENV, localPublishableKey: FAKE_LOCAL_KEY });
    expect(result).toBe(FAKE_LOCAL_KEY);
  });
});

describe('resolveSupabasePublishableKey — precedencia hosted > local > legacy', () => {
  it('la key hosted gana sobre la local y la legacy cuando las 3 existen', () => {
    const result = resolveSupabasePublishableKey({
      publishableKeysRaw: JSON.stringify({ default: FAKE_HOSTED_KEY }),
      localPublishableKey: FAKE_LOCAL_KEY,
      legacyAnonKey: FAKE_LEGACY_KEY,
    });
    expect(result).toBe(FAKE_HOSTED_KEY);
    expect(result).not.toBe(FAKE_LOCAL_KEY);
    expect(result).not.toBe(FAKE_LEGACY_KEY);
  });

  it('la variante local (singular) gana sobre la legacy cuando no hay hosted', () => {
    const result = resolveSupabasePublishableKey({
      publishableKeysRaw: undefined,
      localPublishableKey: FAKE_LOCAL_KEY,
      legacyAnonKey: FAKE_LEGACY_KEY,
    });
    expect(result).toBe(FAKE_LOCAL_KEY);
  });

  it('el legacy funciona SOLO si ninguna de las nuevas variables está configurada', () => {
    const result = resolveSupabasePublishableKey({ ...EMPTY_ENV, legacyAnonKey: FAKE_LEGACY_KEY });
    expect(result).toBe(FAKE_LEGACY_KEY);
  });
});

describe('resolveSupabasePublishableKey — trim', () => {
  it('recorta espacios en los 3 orígenes posibles', () => {
    expect(resolveSupabasePublishableKey({
      ...EMPTY_ENV,
      publishableKeysRaw: JSON.stringify({ default: `  ${FAKE_HOSTED_KEY}  ` }),
    })).toBe(FAKE_HOSTED_KEY);

    expect(resolveSupabasePublishableKey({
      ...EMPTY_ENV,
      localPublishableKey: `  ${FAKE_LOCAL_KEY}  `,
    })).toBe(FAKE_LOCAL_KEY);

    expect(resolveSupabasePublishableKey({
      ...EMPTY_ENV,
      legacyAnonKey: `  ${FAKE_LEGACY_KEY}  `,
    })).toBe(FAKE_LEGACY_KEY);
  });
});

describe('resolveSupabasePublishableKey — ninguna key configurada', () => {
  it('devuelve string vacío (a diferencia de la admin key, que lanza)', () => {
    expect(resolveSupabasePublishableKey(EMPTY_ENV)).toBe('');
  });
});

describe('supabasePublishableKey.ts — nunca loguea la key', () => {
  it('el código fuente no contiene ningún console.log/warn/error que referencie las variables de key', () => {
    expect(supabasePublishableKeySource).not.toMatch(/console\.(log|warn|error|info|debug)/);
  });

  it('los mensajes de error nunca incluyen el valor de las keys ficticias de prueba', () => {
    const attempts = [
      () => resolveSupabasePublishableKey({ ...EMPTY_ENV, publishableKeysRaw: 'bad json', legacyAnonKey: FAKE_LEGACY_KEY }),
      () => resolveSupabasePublishableKey({ ...EMPTY_ENV, publishableKeysRaw: JSON.stringify({ other: FAKE_HOSTED_KEY }), legacyAnonKey: FAKE_LEGACY_KEY }),
    ];
    for (const attempt of attempts) {
      try {
        attempt();
        expect.fail('debería haber lanzado');
      } catch (err) {
        const msg = (err as Error).message;
        expect(msg).not.toContain(FAKE_HOSTED_KEY);
        expect(msg).not.toContain(FAKE_LEGACY_KEY);
      }
    }
  });
});
