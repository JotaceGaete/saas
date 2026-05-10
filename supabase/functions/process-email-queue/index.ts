// process-email-queue — procesa la cola de emails pendientes.
// Busca registros en email_queue con status='pending' y send_at <= now(),
// obtiene user + business, genera el email via send-email, y marca como sent/failed.
//
// Invocado por pg_cron cada hora (ver migración 20260405000000_email_queue_activation24h.sql).
// También puede invocarse manualmente para testing.
//
// Requiere secrets en vault: project_url, anon_key, email_function_secret (opcional).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BATCH_SIZE = 50; // máximo emails por ejecución

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const MAX_RETRIES = 3;
const EMAIL_AUTOMATION_DISABLED_REASON = 'EMAIL_AUTOMATION_DISABLED';

function isEmailAutomationEnabled() {
  return Deno.env.get('EMAIL_AUTOMATION_ENABLED') === 'true';
}

interface QueueRow {
  id: string;
  user_id: string;
  business_id: string;
  type: string;
  send_at: string;
  retry_count: number;
}

interface BusinessRow {
  id: string;
  name: string;
  slug: string;
}

interface UserRow {
  id: string;
  email: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  if (!isEmailAutomationEnabled()) {
    console.log('[process-email-queue] skipped: EMAIL_AUTOMATION_DISABLED');
    return jsonResponse({ skipped: true, reason: EMAIL_AUTOMATION_DISABLED_REASON }, 200);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const emailSecret = Deno.env.get('EMAIL_FUNCTION_SECRET') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  // Guard: si EMAIL_FUNCTION_SECRET está configurado, solo el cron (que lo conoce) puede invocar este endpoint.
  if (emailSecret) {
    const incoming = req.headers.get('x-email-secret') ?? '';
    if (incoming !== emailSecret) {
      console.warn('[process-email-queue] Unauthorized: x-email-secret inválido o ausente');
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
  }

  if (!supabaseUrl || !serviceKey) {
    console.error('[process-email-queue] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // 1. Buscar emails pendientes cuyo send_at ya llegó
  const now = new Date().toISOString();
  const { data: pending, error: fetchErr } = await supabase
    .from('email_queue')
    .select('id, user_id, business_id, type, send_at, retry_count')
    .eq('status', 'pending')
    .lte('send_at', now)
    .limit(BATCH_SIZE);

  if (fetchErr) {
    console.error('[process-email-queue] Error fetching queue:', fetchErr.message);
    return jsonResponse({ error: fetchErr.message }, 500);
  }

  if (!pending || pending.length === 0) {
    console.log('[process-email-queue] No pending emails.');
    return jsonResponse({ processed: 0 });
  }

  console.log(`[process-email-queue] Found ${pending.length} pending email(s).`);

  const results = { sent: 0, failed: 0, skipped: 0 };

  for (const row of pending as QueueRow[]) {
    try {
      await processRow(supabase, supabaseUrl, anonKey, emailSecret, row, results);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[process-email-queue] Unhandled error for queue row ${row.id}:`, msg);
      await markFailed(supabase, row.id, msg, (row as QueueRow).retry_count ?? 0);
      results.failed++;
    }
  }

  console.log('[process-email-queue] Done:', results);
  return jsonResponse({ processed: pending.length, ...results });
});

async function processRow(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  anonKey: string,
  emailSecret: string,
  row: QueueRow,
  results: { sent: number; failed: number; skipped: number }
) {
  const idempotencyKey = `${row.type}:${row.business_id}`;

  // 2. Obtener datos del negocio
  const { data: business, error: bizErr } = await supabase
    .from('wa_businesses')
    .select('id, name, slug')
    .eq('id', row.business_id)
    .maybeSingle() as { data: BusinessRow | null; error: unknown };

  if (bizErr || !business) {
    console.warn(`[process-email-queue] Business not found for queue row ${row.id} (business_id=${row.business_id})`);
    // No reintentar si el negocio no existe — error permanente
    await markFailed(supabase, row.id, 'Business not found', MAX_RETRIES);
    results.failed++;
    return;
  }

  // 3. Obtener email del usuario vía admin API
  const { data: userResp, error: userErr } = await supabase.auth.admin.getUserById(row.user_id);
  const user = userResp?.user as UserRow | null | undefined;

  if (userErr || !user?.email) {
    console.warn(`[process-email-queue] User not found for queue row ${row.id} (user_id=${row.user_id})`);
    // No reintentar si el usuario no existe — error permanente
    await markFailed(supabase, row.id, 'User email not found', MAX_RETRIES);
    results.failed++;
    return;
  }

  // 4. Construir URL del catálogo
  const catalogUrl = `https://miralatienda.de/${business.slug}`;

  // 5. Llamar a send-email con el template activation_24h
  const sendEmailUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/send-email`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${anonKey}`,
    'apikey': anonKey,
  };
  if (emailSecret) {
    headers['x-email-secret'] = emailSecret;
  }

  const payload = {
    to: user.email,
    type: row.type,
    data: {
      businessName: business.name,
      catalogUrl,
    },
    userId: row.user_id,
    businessId: row.business_id,
    idempotencyKey,
    source: 'cron',
  };

  const res = await fetch(sendEmailUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const resText = await res.text();
  let resData: Record<string, unknown> = {};
  try { resData = resText ? JSON.parse(resText) : {}; } catch { /* ignore */ }

  if (!res.ok) {
    const msg = (resData?.error as string) || resText?.slice(0, 200) || 'send-email error';
    console.error(`[process-email-queue] send-email failed for row ${row.id}:`, msg);
    await markFailed(supabase, row.id, msg, row.retry_count ?? 0);
    results.failed++;
    return;
  }

  if (resData?.skipped) {
    console.log(`[process-email-queue] Already sent (idempotency), marking sent: ${row.id}`);
    await markSent(supabase, row.id);
    results.skipped++;
    return;
  }

  console.log(`[process-email-queue] Sent ${row.type} to ${user.email} (row=${row.id})`);
  await markSent(supabase, row.id);
  results.sent++;
}

async function markSent(supabase: ReturnType<typeof createClient>, id: string) {
  const { error } = await supabase
    .from('email_queue')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', id);
  if (error) console.error('[process-email-queue] markSent error:', error.message);
}

async function markFailed(
  supabase: ReturnType<typeof createClient>,
  id: string,
  reason: string,
  currentRetryCount = 0
) {
  const nextRetry = currentRetryCount + 1;
  const exhausted = nextRetry >= MAX_RETRIES;

  if (exhausted) {
    // Sin más reintentos: marcar como failed definitivo
    const { error } = await supabase
      .from('email_queue')
      .update({ status: 'failed', retry_count: nextRetry })
      .eq('id', id);
    if (error) console.error('[process-email-queue] markFailed error:', error.message);
    console.warn(`[process-email-queue] Exhausted retries (id=${id}, retries=${nextRetry}): ${reason}`);
  } else {
    // Reintentar: dejar en pending con send_at diferido (backoff lineal: 30 min × intento)
    const retryDelay = nextRetry * 30; // minutos
    const retryAt = new Date(Date.now() + retryDelay * 60 * 1000).toISOString();
    const { error } = await supabase
      .from('email_queue')
      .update({ retry_count: nextRetry, send_at: retryAt })
      .eq('id', id);
    if (error) console.error('[process-email-queue] markFailed (retry schedule) error:', error.message);
    console.warn(`[process-email-queue] Will retry in ${retryDelay}min (id=${id}, attempt=${nextRetry}): ${reason}`);
  }
}
