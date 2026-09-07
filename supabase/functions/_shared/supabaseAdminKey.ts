/**
 * supabaseAdminKey.ts — obtención de la credencial administrativa de
 * Supabase (bypass RLS) para Edge Functions, compartida por las 19
 * funciones que hoy leen `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`.
 *
 * Mecanismo oficial confirmado en la documentación de Supabase
 * ("Migrating to publishable and secret API keys" / "Managing Environment
 * Variables" -- consultado antes de escribir este archivo, no inventado):
 *
 *   1. Producción/hosted -- `SUPABASE_SECRET_KEYS` es un diccionario JSON
 *      auto-provisto por la plataforma una vez que el proyecto tiene las
 *      nuevas API keys creadas, con forma `{"default": "sb_secret_..."}`
 *      (o más nombres si se crean secret keys adicionales). Se lee así:
 *        JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')!)['default']
 *      "This key will bypass Row Level Security" -- mismo nivel de
 *      privilegio que la legacy service_role key.
 *
 *   2. CLI local (`supabase functions serve` / `supabase start`) -- variante
 *      SINGULAR `SUPABASE_SECRET_KEY` (sin la S final, string plano, no
 *      JSON), documentada como fallback oficial que el SDK también acepta
 *      para desarrollo local. Formato distinto a propósito -- no confundir
 *      con el plural de producción.
 *
 *   3. Legacy `SUPABASE_SERVICE_ROLE_KEY` -- string JWT plano. Sigue
 *      funcionando (Supabase: "hasta fin de 2026"). Se mantiene acá SOLO
 *      como fallback TEMPORAL durante la migración -- prioridad más baja a
 *      propósito, nunca gana si la nueva secret key existe.
 *      TODO(supabase-secret-key-migration): eliminar este fallback una vez
 *      que SUPABASE_SECRET_KEYS esté confirmado funcionando en las 19 Edge
 *      Functions en producción y se desactiven las Legacy API Keys en el
 *      dashboard de Supabase.
 *
 * Nunca hace fallback silencioso a string vacío, y nunca oculta un error de
 * configuración real: si SUPABASE_SECRET_KEYS EXISTE pero no es JSON válido,
 * o no tiene la key pedida, se lanza inmediatamente -- no se cae al legacy
 * en ese caso, porque eso escondería una configuración rota hasta el peor
 * momento posible (cuando se desactiven las legacy keys). El fallback a
 * legacy solo aplica cuando SUPABASE_SECRET_KEYS está AUSENTE del todo.
 * Nunca se loguea el valor de ninguna key, en ningún camino (éxito o error).
 */

export interface AdminKeyEnvInput {
  /** Valor crudo (sin parsear) de la variable SUPABASE_SECRET_KEYS, o undefined si no existe. */
  secretKeysRaw: string | undefined;
  /** Valor crudo de la variante singular de desarrollo local SUPABASE_SECRET_KEY, o undefined. */
  localSecretKey: string | undefined;
  /** Valor crudo de la legacy SUPABASE_SERVICE_ROLE_KEY, o undefined -- fallback temporal. */
  legacyServiceRoleKey: string | undefined;
}

/**
 * Lógica pura de resolución (sin tocar `Deno.env` -- por eso es testeable en
 * Vitest/Node). Recibe los 3 valores ya leídos del entorno y aplica la
 * prioridad: SUPABASE_SECRET_KEYS (prod) > SUPABASE_SECRET_KEY (local) >
 * SUPABASE_SERVICE_ROLE_KEY (legacy, temporal) > error explícito.
 */
export function resolveSupabaseAdminKey(
  env: AdminKeyEnvInput,
  keyName: string = 'default',
): string {
  const { secretKeysRaw, localSecretKey, legacyServiceRoleKey } = env;

  // 1. Nueva secret key de producción -- prioridad máxima. Si la variable
  //    EXISTE pero está rota, se falla acá mismo (nunca cae al legacy en
  //    silencio -- eso ocultaría una configuración rota).
  if (secretKeysRaw !== undefined && secretKeysRaw.trim() !== '') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(secretKeysRaw);
    } catch {
      throw new Error(
        'SUPABASE_SECRET_KEYS_INVALID_JSON: la variable de entorno SUPABASE_SECRET_KEYS existe pero no es JSON válido.',
      );
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(
        'SUPABASE_SECRET_KEYS_INVALID_SHAPE: se esperaba un objeto JSON {nombre: key}, no un array ni un valor primitivo.',
      );
    }
    const record = parsed as Record<string, unknown>;
    const value = record[keyName];
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(
        `SUPABASE_SECRET_KEYS_MISSING_KEY: SUPABASE_SECRET_KEYS no contiene una key válida bajo el nombre '${keyName}'.`,
      );
    }
    return value;
  }

  // 2. Variante singular de desarrollo local (CLI).
  if (localSecretKey !== undefined && localSecretKey.trim() !== '') {
    return localSecretKey;
  }

  // 3. Fallback TEMPORAL a la key legacy -- solo si ninguna de las 2 de
  //    arriba está configurada en absoluto.
  if (legacyServiceRoleKey !== undefined && legacyServiceRoleKey.trim() !== '') {
    return legacyServiceRoleKey;
  }

  // 4. Nada configurado -- fallar explícito, nunca string vacío.
  throw new Error(
    'SUPABASE_ADMIN_KEY_NOT_CONFIGURED: no se encontró SUPABASE_SECRET_KEYS, SUPABASE_SECRET_KEY ni SUPABASE_SERVICE_ROLE_KEY en el entorno.',
  );
}

/**
 * Wrapper fino que lee las 3 variables desde `Deno.env` y delega toda la
 * lógica a resolveSupabaseAdminKey(). Es la única función de este archivo
 * que toca `Deno` -- por eso no se testea directamente en Vitest (no existe
 * `Deno` en Node), pero al no tener ninguna referencia a `Deno` a nivel de
 * módulo (solo dentro del cuerpo de esta función), importar este archivo
 * en Vitest para testear resolveSupabaseAdminKey() no falla.
 *
 * Uso en cada Edge Function (reemplaza el antiguo
 * `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''`):
 *   import { getSupabaseAdminKey } from '../_shared/supabaseAdminKey.ts';
 *   const serviceRoleKey = getSupabaseAdminKey();
 */
export function getSupabaseAdminKey(keyName: string = 'default'): string {
  return resolveSupabaseAdminKey(
    {
      secretKeysRaw: Deno.env.get('SUPABASE_SECRET_KEYS'),
      localSecretKey: Deno.env.get('SUPABASE_SECRET_KEY'),
      legacyServiceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    },
    keyName,
  );
}

/**
 * Variante "segura" para reemplazar 1:1 el patrón previo
 * `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''` en las 19 Edge
 * Functions existentes, SIN cambiar su manejo de errores ni sus respuestas
 * HTTP -- cada función ya tiene su propio chequeo `if (!serviceRoleKey) {
 * ... return jsonResponse({error: 'Server configuration error'}, 500) }`
 * inmediatamente después de esta línea, y esa lógica no se toca. Nunca
 * lanza: si getSupabaseAdminKey() falla por cualquier motivo (nada
 * configurado, o SUPABASE_SECRET_KEYS mal formado), devuelve '' para que
 * el chequeo ya existente en cada función lo detecte exactamente igual que
 * detectaba antes la variable de entorno ausente -- mismo código, mismo
 * mensaje, mismo status HTTP, sin duplicar ese try/catch 19 veces.
 */
export function getSupabaseAdminKeyOrEmpty(keyName: string = 'default'): string {
  try {
    return getSupabaseAdminKey(keyName);
  } catch {
    return '';
  }
}
