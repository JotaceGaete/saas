/**
 * supabasePublishableKey.ts — obtención de la client API key (no-admin) de
 * Supabase para Edge Functions, compartida por las 11 funciones categoría A
 * ("userClient + JWT real del caller") que hoy leen
 * `Deno.env.get('SUPABASE_ANON_KEY')`.
 *
 * Mecanismo oficial confirmado en la documentación de Supabase ("Migrating
 * to publishable and secret API keys" / "Managing Environment Variables" --
 * consultado antes de escribir este archivo, no inventado):
 *
 *   1. Producción/hosted -- `SUPABASE_PUBLISHABLE_KEYS` es un diccionario
 *      JSON auto-provisto por la plataforma una vez que el proyecto tiene
 *      las nuevas API keys creadas, con forma `{"default": "sb_publishable_..."}`
 *      (o más nombres si se crean publishable keys adicionales). Se lee así:
 *        JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')!)['default']
 *
 *   2. CLI local (`supabase functions serve` / `supabase start`) -- variante
 *      SINGULAR `SUPABASE_PUBLISHABLE_KEY` (sin la S final, string plano, no
 *      JSON), fallback para desarrollo local. Formato distinto a propósito --
 *      no confundir con el plural de producción.
 *
 *   3. Legacy `SUPABASE_ANON_KEY` -- string JWT plano. Sigue funcionando
 *      (Supabase: "hasta fin de 2026"). Se mantiene acá SOLO como fallback
 *      TEMPORAL durante la migración -- prioridad más baja a propósito,
 *      nunca gana si la nueva publishable key existe.
 *      TODO(edge-publishable-key-migration): eliminar este fallback una vez
 *      que SUPABASE_PUBLISHABLE_KEYS esté confirmado funcionando en las 11
 *      Edge Functions en producción y se desactiven las Legacy API Keys en
 *      el dashboard de Supabase.
 *
 *   4. Nada configurado -- string vacío. A diferencia del resolver de la
 *      admin/secret key (que falla explícito porque ninguna operación
 *      admin debería continuar sin credencial), esta key es la contraparte
 *      1:1 de `Deno.env.get('SUPABASE_ANON_KEY') ?? ''` que ya usan las 11
 *      funciones sin envolver esa línea en try/catch -- mantener el mismo
 *      contrato (nunca lanza por ausencia total) evita convertir un 500
 *      controlado existente en una excepción no capturada.
 *
 * IMPORTANTE: esta key SOLO debe usarse como client key / `apikey` (segundo
 * argumento de `createClient()`). Nunca debe enviarse como
 * `Authorization: Bearer <key>` -- las publishable keys no son JWT, y
 * cualquier verificador que intente decodificarlas como tal las rechaza
 * ("Invalid JWT"). El JWT real del usuario (`authHeader` / bearer del
 * caller) es siempre lo que va en `Authorization` en estas 11 funciones, y
 * este archivo no lo toca.
 *
 * Si `SUPABASE_PUBLISHABLE_KEYS` EXISTE pero no es JSON válido, o no tiene
 * la key pedida, se lanza inmediatamente en `resolveSupabasePublishableKey`
 * -- no se cae al legacy en ese caso, porque eso escondería una
 * configuración rota hasta el peor momento posible (cuando se desactiven
 * las legacy keys). El fallback a legacy solo aplica cuando
 * `SUPABASE_PUBLISHABLE_KEYS` está AUSENTE del todo. `getSupabasePublishableKeyOrEmpty()`
 * atrapa ese error y devuelve '' -- es la variante pensada para reemplazar
 * 1:1 el patrón previo en las 11 funciones, igual que
 * `getSupabaseAdminKeyOrEmpty()` para la secret key.
 *
 * Nunca se loguea el valor de ninguna key, en ningún camino (éxito o error).
 */

export interface PublishableKeyEnvInput {
  /** Valor crudo (sin parsear) de SUPABASE_PUBLISHABLE_KEYS, o undefined si no existe. */
  publishableKeysRaw: string | undefined;
  /** Valor crudo de la variante singular de desarrollo local SUPABASE_PUBLISHABLE_KEY, o undefined. */
  localPublishableKey: string | undefined;
  /** Valor crudo de la legacy SUPABASE_ANON_KEY, o undefined -- fallback temporal. */
  legacyAnonKey: string | undefined;
}

/**
 * Lógica pura de resolución (sin tocar `Deno.env` -- por eso es testeable en
 * Vitest/Node). Recibe los 3 valores ya leídos del entorno y aplica la
 * prioridad: SUPABASE_PUBLISHABLE_KEYS (prod) > SUPABASE_PUBLISHABLE_KEY
 * (local) > SUPABASE_ANON_KEY (legacy, temporal) > ''.
 */
export function resolveSupabasePublishableKey(
  env: PublishableKeyEnvInput,
  keyName: string = 'default',
): string {
  const { publishableKeysRaw, localPublishableKey, legacyAnonKey } = env;

  // 1. Nueva publishable key de producción -- prioridad máxima. Si la
  //    variable EXISTE pero está rota, se falla acá mismo (nunca cae al
  //    legacy en silencio -- eso ocultaría una configuración rota).
  if (publishableKeysRaw !== undefined && publishableKeysRaw.trim() !== '') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(publishableKeysRaw);
    } catch {
      throw new Error(
        'SUPABASE_PUBLISHABLE_KEYS_INVALID_JSON: la variable de entorno SUPABASE_PUBLISHABLE_KEYS existe pero no es JSON válido.',
      );
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(
        'SUPABASE_PUBLISHABLE_KEYS_INVALID_SHAPE: se esperaba un objeto JSON {nombre: key}, no un array ni un valor primitivo.',
      );
    }
    const record = parsed as Record<string, unknown>;
    const value = record[keyName];
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(
        `SUPABASE_PUBLISHABLE_KEYS_MISSING_KEY: SUPABASE_PUBLISHABLE_KEYS no contiene una key válida bajo el nombre '${keyName}'.`,
      );
    }
    return value.trim();
  }

  // 2. Variante singular de desarrollo local (CLI).
  if (localPublishableKey !== undefined && localPublishableKey.trim() !== '') {
    return localPublishableKey.trim();
  }

  // 3. Fallback TEMPORAL a la key legacy -- solo si ninguna de las 2 de
  //    arriba está configurada en absoluto.
  if (legacyAnonKey !== undefined && legacyAnonKey.trim() !== '') {
    return legacyAnonKey.trim();
  }

  // 4. Nada configurado -- string vacío (ver nota arriba sobre por qué esto
  //    difiere del resolver de la admin key).
  return '';
}

/**
 * Wrapper fino que lee las 3 variables desde `Deno.env` y delega toda la
 * lógica a resolveSupabasePublishableKey(). Puede lanzar si
 * SUPABASE_PUBLISHABLE_KEYS está presente pero mal configurado -- usar
 * getSupabasePublishableKeyOrEmpty() para el reemplazo 1:1 de las 11
 * funciones existentes.
 */
export function getSupabasePublishableKey(keyName: string = 'default'): string {
  return resolveSupabasePublishableKey(
    {
      publishableKeysRaw: Deno.env.get('SUPABASE_PUBLISHABLE_KEYS'),
      localPublishableKey: Deno.env.get('SUPABASE_PUBLISHABLE_KEY'),
      legacyAnonKey: Deno.env.get('SUPABASE_ANON_KEY'),
    },
    keyName,
  );
}

/**
 * Variante "segura" para reemplazar 1:1 el patrón previo
 * `Deno.env.get('SUPABASE_ANON_KEY') ?? ''` en las 11 Edge Functions
 * existentes, SIN cambiar su manejo de errores ni sus respuestas HTTP.
 * Nunca lanza: si getSupabasePublishableKey() falla por cualquier motivo
 * (SUPABASE_PUBLISHABLE_KEYS mal formado), devuelve '' -- exactamente el
 * mismo comportamiento que tenía la línea original cuando la variable de
 * entorno estaba ausente.
 */
export function getSupabasePublishableKeyOrEmpty(keyName: string = 'default'): string {
  try {
    return getSupabasePublishableKey(keyName);
  } catch {
    return '';
  }
}
