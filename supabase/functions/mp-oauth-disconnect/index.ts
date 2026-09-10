// mp-oauth-disconnect — MP-OAUTH-1.
// Desconecta la cuenta de Mercado Pago del negocio del usuario
// autenticado. Aislado del billing de plataforma: no toca
// create-mp-preference, mp-webhook, wa_payments ni billing_subscriptions.
//
// Seguridad: negocio resuelto 100% por SERVICE_ROLE + auth.uid(). No
// acepta businessId del frontend (mismo patrón que create-mp-preference
// y mp-oauth-start).
//
// Diseño de "desconectar" para MP-OAUTH-1: DELETE físico de la fila en
// mp_connections, en vez de status='disconnected' + limpiar columnas de
// ciphertext. Se eligió DELETE por 2 razones:
//   1. access_token_ciphertext es NOT NULL en el esquema (ver migración) --
//      "limpiar el ciphertext manteniendo la fila" requeriría relajar esa
//      garantía NOT NULL o escribir un ciphertext-placeholder artificial,
//      ninguna de las dos es más simple ni más segura que borrar la fila.
//   2. DELETE deja CERO material cifrado remanente en cualquier escenario
//      (incluido un futuro bug de lectura), en vez de confiar en que
//      ninguna columna sensible quede con un valor recuperable. Reconectar
//      simplemente vuelve a crear la fila (wa_upsert_mp_connection ya es
//      un upsert por business_id) -- no hay pérdida funcional.
// Las columnas status/disconnected_at quedan en el esquema para un futuro
// modelo de soft-disconnect con historial, si se decide esa dirección más
// adelante -- no se usan en el flujo de MP-OAUTH-1 porque el DELETE nunca
// deja una fila en la que observarlas como 'disconnected'.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSupabasePublishableKeyOrEmpty } from '../_shared/supabasePublishableKey.ts';
import { resolveBusinessForOAuth, type BusinessRow } from '../mp-oauth-start/lib.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const RESOLUTION_STATUS: Record<string, number> = {
  no_business: 404,
  multiple_businesses: 409,
  ownership_mismatch: 403,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  const authHeader = (req.headers.get('authorization') ?? '').trim();
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return jsonResponse({ error: 'User not authenticated', reason: 'missing_or_invalid_header' }, 401);
  }

  const supabaseUrl    = Deno.env.get('SUPABASE_URL')              ?? '';
  const anonKey        = getSupabasePublishableKeyOrEmpty();
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!serviceRoleKey) {
    console.error('[mp-oauth-disconnect] SUPABASE_SERVICE_ROLE_KEY not set');
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }

  // ── 1. Validar usuario desde el JWT ────────────────────────────────────────
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const user = userData?.user ?? null;
  if (!user?.id) {
    console.log('[mp-oauth-disconnect] 401: JWT inválido', userError?.message);
    return jsonResponse({ error: 'User not authenticated', reason: 'invalid_jwt' }, 401);
  }

  // ── 2. businessId del body (si viniera) IGNORADO explícitamente ───────────
  let body: Record<string, unknown> = {};
  try { body = (await req.json().catch(() => ({}))) as Record<string, unknown>; } catch { body = {}; }
  if (body?.businessId) {
    console.warn('[mp-oauth-disconnect] businessId en body IGNORADO — se resuelve solo por auth.uid()');
  }

  // ── 3. Resolver negocio con SERVICE_ROLE (sin RLS, sin ambigüedad) ─────────
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: businesses, error: bizError } = await adminClient
    .from('wa_businesses')
    .select('id, user_id')
    .eq('user_id', user.id);

  if (bizError) {
    console.error('[mp-oauth-disconnect] error query wa_businesses:', bizError.message);
    return jsonResponse({ error: 'Business not found for user' }, 404);
  }

  const resolution = resolveBusinessForOAuth((businesses ?? []) as BusinessRow[], user.id);
  if (!resolution.ok) {
    console.error('[mp-oauth-disconnect] business resolution failed:', resolution.reason);
    return jsonResponse(
      { error: 'Business not found for user', reason: resolution.reason },
      RESOLUTION_STATUS[resolution.reason] ?? 400,
    );
  }
  const business = resolution.business;

  // ── 4. Eliminar la conexión (idempotente: 0 filas afectadas si ya estaba
  //      desconectado/nunca existió — no es un error, sigue siendo éxito) ────
  const { error: deleteError } = await adminClient
    .from('mp_connections')
    .delete()
    .eq('business_id', business.id);

  if (deleteError) {
    console.error('[mp-oauth-disconnect] error eliminando mp_connections:', deleteError.message);
    return jsonResponse({ error: 'No se pudo desconectar Mercado Pago' }, 500);
  }

  console.log('[mp-oauth-disconnect] mp_connection_deleted', { businessId: business.id });

  return jsonResponse({ connected: false }, 200);
});
