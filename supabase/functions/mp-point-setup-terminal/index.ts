// mp-point-setup-terminal — POINT-SMART-2-4B.
// Verifica que la terminal indicada pertenece a la cuenta Mercado Pago del
// negocio autenticado y, solo si aún no está en PDV, solicita el cambio a
// modo integrado mediante PATCH /terminals/v1/setup.
//
// Seguridad:
// - JWT validado dentro del handler.
// - business_id se resuelve exclusivamente desde auth.uid().
// - access_token OAuth permanece server-side.
// - terminalId NO se acepta ciegamente: primero se re-listan las terminales
//   de la propia cuenta MP y se exige una coincidencia exacta.
// - el único modo que esta función permite establecer es PDV.
//
// Esta fase NO crea orders, NO cobra, NO toca caja, stock ni ventas.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSupabasePublishableKeyOrEmpty } from '../_shared/supabasePublishableKey.ts';
import { getSupabaseAdminKeyOrEmpty } from '../_shared/supabaseAdminKey.ts';

const MP_TERMINALS_URL = 'https://api.mercadopago.com/terminals/v1/list';
const MP_SETUP_URL = 'https://api.mercadopago.com/terminals/v1/setup';
const MAX_BODY_BYTES = 4096;
const MAX_TERMINAL_ID_LENGTH = 200;

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

type MpTerminal = {
  id?: unknown;
  pos_id?: unknown;
  store_id?: unknown;
  external_pos_id?: unknown;
  operating_mode?: unknown;
};

function safeString(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function sanitizeTerminal(terminal: MpTerminal) {
  return {
    id: safeString(terminal.id),
    pos_id: safeString(terminal.pos_id),
    store_id: safeString(terminal.store_id),
    external_pos_id: safeString(terminal.external_pos_id),
    operating_mode: safeString(terminal.operating_mode) ?? 'UNDEFINED',
  };
}

function isExpired(expiresAt: unknown): boolean {
  if (typeof expiresAt !== 'string' || !expiresAt) return false;
  const ms = Date.parse(expiresAt);
  return Number.isFinite(ms) && ms <= Date.now();
}

async function listMpTerminals(accessToken: string): Promise<
  | { ok: true; terminals: ReturnType<typeof sanitizeTerminal>[] }
  | { ok: false; status: number; reason: string }
> {
  let response: Response;
  try {
    response = await fetch(`${MP_TERMINALS_URL}?limit=50&offset=0`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  } catch {
    return { ok: false, status: 502, reason: 'MP_TERMINALS_UNAVAILABLE' };
  }

  const raw = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      status: response.status === 401 ? 409 : 502,
      reason: response.status === 401 ? 'MP_POINT_CONNECTION_UNAUTHORIZED' : 'MP_TERMINALS_FAILED',
    };
  }

  try {
    const payload = JSON.parse(raw) as { data?: { terminals?: MpTerminal[] } };
    const source = Array.isArray(payload?.data?.terminals) ? payload.data.terminals : [];
    return {
      ok: true,
      terminals: source.map(sanitizeTerminal).filter((terminal) => !!terminal.id),
    };
  } catch {
    return { ok: false, status: 502, reason: 'MP_TERMINALS_FAILED' };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed', reason: 'INVALID_REQUEST' }, 405);
  }

  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return jsonResponse({ error: 'Request too large', reason: 'INVALID_REQUEST' }, 400);
  }

  const authHeader = (req.headers.get('authorization') ?? '').trim();
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return jsonResponse({ error: 'User not authenticated', reason: 'missing_or_invalid_header' }, 401);
  }

  let body: Record<string, unknown> = {};
  try { body = (await req.json().catch(() => ({}))) as Record<string, unknown>; } catch { body = {}; }

  if (body.businessId !== undefined) {
    console.warn('[mp-point-setup-terminal] businessId en body IGNORADO');
  }

  const terminalId = typeof body.terminalId === 'string' ? body.terminalId.trim() : '';
  if (!terminalId || terminalId.length > MAX_TERMINAL_ID_LENGTH) {
    return jsonResponse({ error: 'terminalId required', reason: 'INVALID_TERMINAL_ID' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = getSupabasePublishableKeyOrEmpty();
  const serviceRoleKey = getSupabaseAdminKeyOrEmpty();
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('[mp-point-setup-terminal] server configuration missing');
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }

  // 1. Usuario autenticado.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const user = userData?.user ?? null;
  if (!user?.id) {
    console.warn('[mp-point-setup-terminal] invalid JWT', userError?.message);
    return jsonResponse({ error: 'User not authenticated', reason: 'invalid_jwt' }, 401);
  }

  // 2. Resolver tenant por auth.uid(), nunca por body.
  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: businesses, error: bizError } = await admin
    .from('wa_businesses')
    .select('id')
    .eq('user_id', user.id);

  if (bizError) {
    console.error('[mp-point-setup-terminal] business lookup failed:', bizError.message);
    return jsonResponse({ error: 'Business lookup failed' }, 500);
  }
  if (!businesses || businesses.length === 0) {
    return jsonResponse({ error: 'Business not found', reason: 'no_business' }, 404);
  }
  if (businesses.length !== 1) {
    return jsonResponse({ error: 'Business resolution ambiguous', reason: 'multiple_businesses' }, 409);
  }
  const businessId = businesses[0].id as string;

  // 3. Recuperar token OAuth del comercio únicamente server-side.
  const { data: rows, error: connError } = await admin.rpc('wa_get_mp_point_connection', {
    p_business_id: businessId,
  });
  if (connError) {
    console.error('[mp-point-setup-terminal] Point connection lookup failed:', connError.message, { businessId });
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }

  const connection = Array.isArray(rows) ? rows[0] : null;
  if (!connection || typeof connection.access_token !== 'string' || !connection.access_token) {
    return jsonResponse({ error: 'Mercado Pago not connected', reason: 'MP_POINT_NOT_CONNECTED' }, 409);
  }
  if (isExpired(connection.token_expires_at)) {
    return jsonResponse({ error: 'Mercado Pago connection expired', reason: 'MP_POINT_CONNECTION_EXPIRED' }, 409);
  }
  const accessToken = connection.access_token as string;

  // 4. Revalidar pertenencia de terminal contra Mercado Pago. El terminalId
  //    recibido solo expresa intención del usuario; nunca autoridad.
  const beforeResult = await listMpTerminals(accessToken);
  if (!beforeResult.ok) {
    console.error('[mp-point-setup-terminal] terminal list failed before setup', {
      businessId,
      reason: beforeResult.reason,
    });
    return jsonResponse({ error: 'Could not verify Point terminal', reason: beforeResult.reason }, beforeResult.status);
  }

  const before = beforeResult.terminals.find((terminal) => terminal.id === terminalId);
  if (!before) {
    return jsonResponse({ error: 'Point terminal not found', reason: 'TERMINAL_NOT_FOUND' }, 404);
  }

  // La documentación de MP indica que para operar en PDV la terminal debe
  // estar asociada a sucursal+caja. Fallamos antes del PATCH con un mensaje
  // accionable cuando esos identificadores no están presentes.
  if (!before.store_id || !before.pos_id) {
    return jsonResponse({
      error: 'Point terminal requires store and point of sale association',
      reason: 'TERMINAL_STORE_POS_REQUIRED',
      terminal: before,
    }, 409);
  }

  // Idempotencia funcional: si ya está en PDV no enviamos PATCH innecesario.
  if (before.operating_mode === 'PDV') {
    return jsonResponse({
      ok: true,
      changed: false,
      restart_required: false,
      terminal: before,
    }, 200);
  }

  // 5. Única mutación permitida por 2-4B: activar PDV.
  let setupResponse: Response;
  try {
    setupResponse = await fetch(MP_SETUP_URL, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        terminals: [{ id: terminalId, operating_mode: 'PDV' }],
      }),
    });
  } catch (err) {
    console.error('[mp-point-setup-terminal] Mercado Pago network error:', (err as Error)?.message, { businessId });
    return jsonResponse({ error: 'Mercado Pago unavailable', reason: 'MP_SETUP_UNAVAILABLE' }, 502);
  }

  const setupRaw = await setupResponse.text();
  if (!setupResponse.ok) {
    // No devolver ni loguear el body crudo de MP. Los códigos HTTP conocidos
    // se traducen a razones estables para la UI.
    console.error('[mp-point-setup-terminal] Mercado Pago setup error status:', setupResponse.status, { businessId });
    const reason =
      setupResponse.status === 400 ? 'MP_SETUP_INVALID_OR_STORE_POS_REQUIRED' :
      setupResponse.status === 404 ? 'TERMINAL_NOT_FOUND' :
      setupResponse.status === 412 ? 'TERMINAL_POS_ALREADY_IN_USE' :
      setupResponse.status === 401 ? 'MP_POINT_CONNECTION_UNAUTHORIZED' :
      'MP_SETUP_FAILED';
    const status = setupResponse.status === 401 ? 409 :
      [400, 404, 412].includes(setupResponse.status) ? setupResponse.status : 502;
    return jsonResponse({ error: 'Could not activate Point PDV mode', reason }, status);
  }

  // Validar que MP respondió JSON, pero NO confiar solo en el PATCH: hacemos
  // GET posterior y ese GET es la verificación authoritative de 2-4B.
  try {
    JSON.parse(setupRaw);
  } catch {
    console.error('[mp-point-setup-terminal] invalid setup JSON from Mercado Pago', { businessId });
    return jsonResponse({ error: 'Invalid Mercado Pago response', reason: 'MP_SETUP_FAILED' }, 502);
  }

  const afterResult = await listMpTerminals(accessToken);
  if (!afterResult.ok) {
    // El PATCH pudo haberse aplicado aunque falle la relectura. No afirmar
    // éxito ni sugerir repetir ciegamente: devolver estado incierto.
    console.warn('[mp-point-setup-terminal] setup accepted but verification failed', {
      businessId,
      terminalId,
      reason: afterResult.reason,
    });
    return jsonResponse({
      error: 'Point setup accepted but could not be verified',
      reason: 'MP_SETUP_VERIFICATION_PENDING',
      restart_required: true,
    }, 202);
  }

  const after = afterResult.terminals.find((terminal) => terminal.id === terminalId);
  if (!after) {
    return jsonResponse({
      error: 'Point setup accepted but terminal could not be re-read',
      reason: 'MP_SETUP_VERIFICATION_PENDING',
      restart_required: true,
    }, 202);
  }

  if (after.operating_mode !== 'PDV') {
    return jsonResponse({
      error: 'Point setup accepted but PDV mode is not confirmed yet',
      reason: 'MP_SETUP_VERIFICATION_PENDING',
      restart_required: true,
      terminal: after,
    }, 202);
  }

  console.log('[mp-point-setup-terminal] pdv_enabled', { businessId, terminalId });

  return jsonResponse({
    ok: true,
    changed: true,
    restart_required: true,
    terminal: after,
  }, 200);
});
