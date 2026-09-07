/**
 * supabaseAdminKey — batería de tests unitarios
 * Ejecutar: npx vitest run supabase/functions/_shared/supabaseAdminKey.test.ts
 *
 * Testea únicamente resolveSupabaseAdminKey() (lógica pura) -- nunca
 * getSupabaseAdminKey() (toca `Deno.env`, no existe en Vitest/Node).
 * Todos los valores usados son strings ficticios, nunca claves reales.
 */

import { describe, it, expect } from 'vitest';
import { resolveSupabaseAdminKey } from './supabaseAdminKey';
// Vite `?raw` import: contenido crudo del archivo como string, sin resolver
// módulos -- evita depender de fs/import.meta.url bajo el transform de Vitest.
import supabaseAdminKeySource from './supabaseAdminKey.ts?raw';

const FAKE_NEW_KEY = 'sb_secret_test_123';
const FAKE_LOCAL_KEY = 'sb_secret_local_test_456';
const FAKE_LEGACY_KEY = 'eyJfake.legacy.jwt.test789';

const EMPTY_ENV = { secretKeysRaw: undefined, localSecretKey: undefined, legacyServiceRoleKey: undefined };

describe('resolveSupabaseAdminKey — nueva secret key presente', () => {
  it('devuelve la key "default" desde SUPABASE_SECRET_KEYS cuando está bien formada', () => {
    const result = resolveSupabaseAdminKey({
      ...EMPTY_ENV,
      secretKeysRaw: JSON.stringify({ default: FAKE_NEW_KEY }),
    });
    expect(result).toBe(FAKE_NEW_KEY);
  });

  it('permite pedir una key con nombre distinto de "default"', () => {
    const result = resolveSupabaseAdminKey(
      { ...EMPTY_ENV, secretKeysRaw: JSON.stringify({ default: FAKE_NEW_KEY, billing: 'sb_secret_billing_999' }) },
      'billing',
    );
    expect(result).toBe('sb_secret_billing_999');
  });
});

describe('resolveSupabaseAdminKey — SUPABASE_SECRET_KEYS mal formado', () => {
  it('JSON inválido → error controlado (no cae al legacy en silencio)', () => {
    expect(() =>
      resolveSupabaseAdminKey({
        ...EMPTY_ENV,
        secretKeysRaw: '{not valid json',
        legacyServiceRoleKey: FAKE_LEGACY_KEY, // presente, pero NO debe usarse
      }),
    ).toThrowError(/SUPABASE_SECRET_KEYS_INVALID_JSON/);
  });

  it('JSON válido pero no es un objeto (array) → error controlado', () => {
    expect(() =>
      resolveSupabaseAdminKey({ ...EMPTY_ENV, secretKeysRaw: '["not", "an", "object"]', legacyServiceRoleKey: FAKE_LEGACY_KEY }),
    ).toThrowError(/SUPABASE_SECRET_KEYS_INVALID_SHAPE/);
  });

  it('JSON válido pero primitivo (string) → error controlado', () => {
    expect(() =>
      resolveSupabaseAdminKey({ ...EMPTY_ENV, secretKeysRaw: '"just a string"', legacyServiceRoleKey: FAKE_LEGACY_KEY }),
    ).toThrowError(/SUPABASE_SECRET_KEYS_INVALID_SHAPE/);
  });

  it('objeto sin la key "default" → error controlado', () => {
    expect(() =>
      resolveSupabaseAdminKey({
        ...EMPTY_ENV,
        secretKeysRaw: JSON.stringify({ billing: 'sb_secret_billing_999' }),
        legacyServiceRoleKey: FAKE_LEGACY_KEY, // presente, pero NO debe usarse
      }),
    ).toThrowError(/SUPABASE_SECRET_KEYS_MISSING_KEY/);
  });

  it('objeto con "default" vacío → error controlado, igual que ausente', () => {
    expect(() =>
      resolveSupabaseAdminKey({ ...EMPTY_ENV, secretKeysRaw: JSON.stringify({ default: '' }) }),
    ).toThrowError(/SUPABASE_SECRET_KEYS_MISSING_KEY/);
  });

  it('un SUPABASE_SECRET_KEYS roto NUNCA hace fallback silencioso al legacy, aunque el legacy esté disponible', () => {
    // Esto es exactamente lo que el ticket pide evitar: "no debe ocultar
    // errores de configuración". Si SECRET_KEYS existe pero está mal
    // configurado, es un error real que hay que ver, no esconder.
    try {
      resolveSupabaseAdminKey({ ...EMPTY_ENV, secretKeysRaw: '{"other":"x"}', legacyServiceRoleKey: FAKE_LEGACY_KEY });
      expect.fail('debería haber lanzado');
    } catch (err) {
      expect((err as Error).message).not.toContain(FAKE_LEGACY_KEY);
      expect((err as Error).message).toMatch(/SUPABASE_SECRET_KEYS_MISSING_KEY/);
    }
  });
});

describe('resolveSupabaseAdminKey — variante local de desarrollo', () => {
  it('usa SUPABASE_SECRET_KEY (singular) cuando SUPABASE_SECRET_KEYS no está definida', () => {
    const result = resolveSupabaseAdminKey({ ...EMPTY_ENV, localSecretKey: FAKE_LOCAL_KEY });
    expect(result).toBe(FAKE_LOCAL_KEY);
  });
});

describe('resolveSupabaseAdminKey — precedencia nueva vs legacy', () => {
  it('la nueva secret key gana sobre la legacy cuando ambas existen', () => {
    const result = resolveSupabaseAdminKey({
      secretKeysRaw: JSON.stringify({ default: FAKE_NEW_KEY }),
      localSecretKey: undefined,
      legacyServiceRoleKey: FAKE_LEGACY_KEY,
    });
    expect(result).toBe(FAKE_NEW_KEY);
    expect(result).not.toBe(FAKE_LEGACY_KEY);
  });

  it('la variante local (singular) también gana sobre la legacy', () => {
    const result = resolveSupabaseAdminKey({
      secretKeysRaw: undefined,
      localSecretKey: FAKE_LOCAL_KEY,
      legacyServiceRoleKey: FAKE_LEGACY_KEY,
    });
    expect(result).toBe(FAKE_LOCAL_KEY);
  });

  it('el legacy funciona SOLO si ninguna de las nuevas variables está configurada', () => {
    const result = resolveSupabaseAdminKey({ ...EMPTY_ENV, legacyServiceRoleKey: FAKE_LEGACY_KEY });
    expect(result).toBe(FAKE_LEGACY_KEY);
  });
});

describe('resolveSupabaseAdminKey — ninguna key configurada', () => {
  it('lanza un error explícito, nunca devuelve string vacío', () => {
    expect(() => resolveSupabaseAdminKey(EMPTY_ENV)).toThrowError(/SUPABASE_ADMIN_KEY_NOT_CONFIGURED/);
  });

  it('nunca devuelve "" silenciosamente en ningún camino de error', () => {
    const cases: Array<Parameters<typeof resolveSupabaseAdminKey>[0]> = [
      EMPTY_ENV,
      { ...EMPTY_ENV, secretKeysRaw: 'not json' },
      { ...EMPTY_ENV, secretKeysRaw: JSON.stringify({}) },
    ];
    for (const env of cases) {
      expect(() => resolveSupabaseAdminKey(env)).toThrow();
    }
  });
});

describe('supabaseAdminKey.ts — nunca loguea la key', () => {
  it('el código fuente no contiene ningún console.log/warn/error que referencie las variables de key', () => {
    // No debe haber ningún console.* en todo el archivo -- ni de éxito ni de error.
    expect(supabaseAdminKeySource).not.toMatch(/console\.(log|warn|error|info|debug)/);
  });

  it('los mensajes de error nunca incluyen el valor de las keys ficticias de prueba', () => {
    const attempts = [
      () => resolveSupabaseAdminKey({ ...EMPTY_ENV, secretKeysRaw: 'bad json', legacyServiceRoleKey: FAKE_LEGACY_KEY }),
      () => resolveSupabaseAdminKey({ ...EMPTY_ENV, secretKeysRaw: JSON.stringify({ other: FAKE_NEW_KEY }), legacyServiceRoleKey: FAKE_LEGACY_KEY }),
    ];
    for (const attempt of attempts) {
      try {
        attempt();
        expect.fail('debería haber lanzado');
      } catch (err) {
        const msg = (err as Error).message;
        expect(msg).not.toContain(FAKE_NEW_KEY);
        expect(msg).not.toContain(FAKE_LEGACY_KEY);
      }
    }
  });
});
