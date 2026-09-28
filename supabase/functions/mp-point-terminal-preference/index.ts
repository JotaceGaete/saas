// mp-point-terminal-preference — selección/desvinculación de la Point usada por Walinka.
// No borra dispositivos en Mercado Pago, no modifica OAuth y no toca ventas históricas.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSupabasePublishableKeyOrEmpty } from '../_shared/supabasePublishableKey.ts';
import { getSupabaseAdminKeyOrEmpty } from '../_shared/supabaseAdminKey.ts';

const MP_TERMINALS_URL = 'https://api.mercadopago.com/terminals/v1/list';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
function safeString(value: unknown): string | null {
  return typeof value === 'string' ? value : (typeof value === 'number' && Number.isFinite(value) ? String(value) : null);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed', reason: 'INVALID_REQUEST' }, 405);

  const authHeader = (req.headers.get('authorization') ?? '').trim();
  if (!authHeader.toLowerCase().startsWith('bearer ')) return jsonResponse({ error: 'User not authenticated' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = getSupabasePublishableKeyOrEmpty();
  const serviceRoleKey = getSupabaseAdminKeyOrEmpty();
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return jsonResponse({ error: 'Server configuration error' }, 500);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user?.id) return jsonResponse({ error: 'User not authenticated' }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: businesses, error: bizError } = await admin.from('wa_businesses').select('id').eq('user_id', user.id);
  if (bizError) return jsonResponse({ error: 'Business lookup failed' }, 500);
  if (!businesses?.length) return jsonResponse({ error: 'Business not found', reason: 'no_business' }, 404);
  if (businesses.length !== 1) return jsonResponse({ error: 'Business resolution ambiguous', reason: 'multiple_businesses' }, 409);
  const businessId = businesses[0].id as string;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { body = {}; }
  const action = body.action === 'select' || body.action === 'unlink' || body.action === 'get' || body.action === 'verify' ? body.action : null;
  if (!action) return jsonResponse({ error: 'Invalid action', reason: 'INVALID_REQUEST' }, 400);

  if (action === 'get') {
    const { data, error } = await admin.from('crm_point_terminal_preferences')
      .select('terminal_id,verification_status,selected_at,verified_at,updated_at').eq('business_id', businessId).maybeSingle();
    if (error) return jsonResponse({ error: 'Could not read Point preference' }, 500);
    return jsonResponse({ ok: true, preference: data ?? null });
  }

  if (action === 'unlink') {
    const { error } = await admin.from('crm_point_terminal_preferences').upsert({
      business_id: businessId, terminal_id: null, verification_status: 'pending',
      selected_at: null, verified_at: null,
    }, { onConflict: 'business_id' });
    if (error) return jsonResponse({ error: 'Could not unlink Point terminal' }, 500);
    return jsonResponse({ ok: true, preference: null });
  }

  const terminalId = typeof body.terminalId === 'string' ? body.terminalId.trim() : '';
  if (!terminalId || terminalId.length > 200) return jsonResponse({ error: 'terminalId required', reason: 'INVALID_TERMINAL_ID' }, 400);

  // Antes de persistir, revalidar que la terminal pertenece a la cuenta Point OAuth.
  const { data: rows, error: connError } = await admin.rpc('wa_get_mp_point_connection', { p_business_id: businessId });
  const connection = Array.isArray(rows) ? rows[0] : null;
  if (connError || !connection?.access_token) return jsonResponse({ error: 'Mercado Pago not connected', reason: 'MP_POINT_NOT_CONNECTED' }, 409);

  let mpRes: Response;
  try {
    mpRes = await fetch(`${MP_TERMINALS_URL}?limit=50&offset=0`, { headers: { Authorization: `Bearer ${connection.access_token}` } });
  } catch {
    return jsonResponse({ error: 'Mercado Pago unavailable', reason: 'MP_TERMINALS_UNAVAILABLE' }, 502);
  }
  if (!mpRes.ok) return jsonResponse({ error: 'Could not verify Point terminal', reason: 'MP_TERMINALS_FAILED' }, 502);

  let source: Record<string, unknown>[] = [];
  try {
    const payload = await mpRes.json();
    source = Array.isArray(payload?.data?.terminals) ? payload.data.terminals : [];
  } catch {
    return jsonResponse({ error: 'Invalid Mercado Pago response', reason: 'MP_TERMINALS_FAILED' }, 502);
  }
  const terminal = source.find((t) => safeString(t.id) === terminalId);
  if (!terminal) return jsonResponse({ error: 'Point terminal not found', reason: 'TERMINAL_NOT_FOUND' }, 404);

  if (action === 'verify') {
    const { data: preference, error: preferenceError } = await admin.from('crm_point_terminal_preferences')
      .select('terminal_id,verification_status,selected_at,verified_at')
      .eq('business_id', businessId).maybeSingle();
    if (preferenceError) return jsonResponse({ error: 'Could not read Point preference' }, 500);
    if (!preference?.terminal_id || preference.terminal_id !== terminalId) {
      return jsonResponse({ error: 'Point terminal is not the active terminal', reason: 'POINT_TERMINAL_NOT_ACTIVE' }, 409);
    }
    if (safeString(terminal.operating_mode) !== 'PDV') {
      return jsonResponse({ error: 'Mercado Pago does not report this terminal in PDV mode', reason: 'POINT_TERMINAL_NOT_PDV' }, 409);
    }
    const { data: verified, error: verifyError } = await admin.from('crm_point_terminal_preferences').update({
      verification_status: 'verified', verified_at: new Date().toISOString(),
    }).eq('business_id', businessId).eq('terminal_id', terminalId)
      .select('terminal_id,verification_status,selected_at,verified_at').single();
    if (verifyError) return jsonResponse({ error: 'Could not verify Point terminal' }, 500);
    return jsonResponse({ ok: true, preference: verified, terminal: {
      id: terminalId,
      pos_id: safeString(terminal.pos_id),
      store_id: safeString(terminal.store_id),
      operating_mode: safeString(terminal.operating_mode) ?? 'UNDEFINED',
    }});
  }

  const { data, error } = await admin.from('crm_point_terminal_preferences').upsert({
    business_id: businessId,
    terminal_id: terminalId,
    verification_status: 'pending',
    selected_at: new Date().toISOString(),
    verified_at: null,
  }, { onConflict: 'business_id' }).select('terminal_id,verification_status,selected_at,verified_at').single();

  if (error) return jsonResponse({ error: 'Could not select Point terminal' }, 500);
  return jsonResponse({ ok: true, preference: data, terminal: {
    id: terminalId,
    pos_id: safeString(terminal.pos_id),
    store_id: safeString(terminal.store_id),
    operating_mode: safeString(terminal.operating_mode) ?? 'UNDEFINED',
  }});
});
