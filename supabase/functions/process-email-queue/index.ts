// process-email-queue — procesa la cola de emails pendientes.
// Reclama un lote de email_queue de forma atómica (wa_claim_email_queue_batch,
// FOR UPDATE SKIP LOCKED server-side -- dos ejecuciones concurrentes nunca
// procesan la misma fila) y por cada una:
//   - welcome / activation_24h: comportamiento legacy sin cambios (lookup de
//     user+business, llama send-email con el payload de siempre).
//   - payment_received_buyer / payment_received_merchant (EMAIL-PAYMENTS-1):
//     relee wa_orders/wa_order_items/wa_order_payments/wa_businesses FRESCO
//     desde payload.order_id -- nunca confía en un snapshot tomado al encolar.
//
// Invocado por pg_cron (ver 20260405000000_email_queue_activation24h.sql,
// hourly, hoy desprogramado; 20260910190000_reactivate_process_email_queue_cron.sql
// prepara una reactivación a cada 2 minutos, NO aplicada). También puede
// invocarse manualmente para testing.
//
// Requiere secrets en vault: project_url, anon_key, email_function_secret
// (EMAIL-PAYMENTS-1: OBLIGATORIO, no opcional -- ver más abajo).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSupabaseAdminKeyOrEmpty } from '../_shared/supabaseAdminKey.ts';
import { getSupabasePublishableKeyOrEmpty } from '../_shared/supabasePublishableKey.ts';

const BATCH_SIZE = 50; // máximo emails por ejecución
const CLAIM_STALE_MINUTES = 5; // umbral para reclamar filas 'processing' abandonadas
// Nota: el mapeo de method -> label humano vive SOLO en send-email
// (paymentMethodLabel) -- acá se pasa el valor crudo de wa_order_payments/
// wa_orders, nunca se re-implementa el mapeo.

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
const ALL_EMAIL_CATEGORIES_DISABLED_REASON = 'ALL_EMAIL_CATEGORIES_DISABLED';

function isEmailAutomationEnabled() {
  return Deno.env.get('EMAIL_AUTOMATION_ENABLED') === 'true';
}

// EMAIL-PAYMENTS-1 (flag separation): mismo criterio que en send-email --
// payment_received_buyer/merchant tienen su propio flag, independiente de
// EMAIL_AUTOMATION_ENABLED (welcome/activation_24h/etc.). Ninguno de los
// dos implica ni requiere el otro.
function isPaymentEmailsEnabled() {
  return Deno.env.get('PAYMENT_EMAILS_ENABLED') === 'true';
}

interface QueueRow {
  id: string;
  user_id: string | null;
  business_id: string;
  type: string;
  send_at: string | null;
  retry_count: number;
  event_key: string | null;
  payload: Record<string, unknown> | null;
}

interface BusinessRow {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  whatsapp: string | null;
  user_id: string | null;
}

interface UserRow {
  id: string;
  email: string;
}

interface OrderRow {
  id: string;
  business_id: string;
  customer_name: string | null;
  customer_email: string | null;
  total_amount: number;
  currency: string;
  paid_at: string | null;
}

interface OrderItemRow {
  product_name: string;
  quantity: number;
  subtotal: number;
}

interface OrderPaymentRow {
  provider: string;
  method: string;
  provider_payment_id: string | null;
  walinka_fee: number;
  mp_fee: number | null;
  net_amount: number | null;
  paid_at: string;
}

const PAYMENT_EMAIL_TYPES = new Set(['payment_received_buyer', 'payment_received_merchant']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  // EMAIL-PAYMENTS-1 (flag separation): dos flags independientes en vez de
  // uno solo. Objetivo de producción explícito: poder tener
  // EMAIL_AUTOMATION_ENABLED=false + PAYMENT_EMAILS_ENABLED=true (pagos
  // activos, welcome/activation_24h siguen apagados) sin que uno dependa
  // del otro. Si AMBOS están apagados, ni siquiera vale la pena reclamar
  // un lote -- salida barata, igual que antes.
  const automationEnabled = isEmailAutomationEnabled();
  const paymentEmailsEnabled = isPaymentEmailsEnabled();
  if (!automationEnabled && !paymentEmailsEnabled) {
    console.log('[process-email-queue] skipped: EMAIL_AUTOMATION_ENABLED y PAYMENT_EMAILS_ENABLED están ambos en false');
    return jsonResponse({ skipped: true, reason: ALL_EMAIL_CATEGORIES_DISABLED_REASON }, 200);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = getSupabaseAdminKeyOrEmpty();
  const emailSecret = Deno.env.get('EMAIL_FUNCTION_SECRET') ?? '';
  const anonKey = getSupabasePublishableKeyOrEmpty();

  // EMAIL-PAYMENTS-1 (hardening): EMAIL_FUNCTION_SECRET ahora es
  // OBLIGATORIO, no opcional -- sin él, ni este endpoint acepta invocaciones
  // no-admin, ni send-email (ver su propio hardening). Antes, sin el
  // secret configurado, ambos endpoints funcionaban sin validación alguna.
  if (!emailSecret) {
    console.error('[process-email-queue] EMAIL_FUNCTION_SECRET no configurado -- rechazando (fail closed)');
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }
  const incoming = req.headers.get('x-email-secret') ?? '';
  if (incoming !== emailSecret) {
    console.warn('[process-email-queue] Unauthorized: x-email-secret inválido o ausente');
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  if (!supabaseUrl || !serviceKey) {
    console.error('[process-email-queue] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // 1. Reclamar un lote de forma atómica (FOR UPDATE SKIP LOCKED
  // server-side, ver wa_claim_email_queue_batch). Dos ejecuciones
  // concurrentes de este endpoint nunca reciben la misma fila -- ya no hay
  // un SELECT sin lock entre "leer" y "marcar processing". El filtro de
  // categoría (p_include_payment_types/p_include_legacy_types) hace que
  // una fila de una categoría deshabilitada nunca se reclame -- no hace
  // falta "liberarla" después si su flag está apagado.
  const { data: claimed, error: claimErr } = await supabase.rpc('wa_claim_email_queue_batch', {
    p_batch_size: BATCH_SIZE,
    p_stale_minutes: CLAIM_STALE_MINUTES,
    p_include_payment_types: paymentEmailsEnabled,
    p_include_legacy_types: automationEnabled,
  });

  if (claimErr) {
    console.error('[process-email-queue] Error claiming queue batch:', claimErr.message);
    return jsonResponse({ error: claimErr.message }, 500);
  }

  const rows = (claimed ?? []) as QueueRow[];
  if (rows.length === 0) {
    console.log('[process-email-queue] No pending emails.');
    return jsonResponse({ processed: 0 });
  }

  console.log(`[process-email-queue] Claimed ${rows.length} email(s).`);

  const results = { sent: 0, failed: 0, skipped: 0 };

  for (const row of rows) {
    try {
      if (PAYMENT_EMAIL_TYPES.has(row.type)) {
        await processPaymentRow(supabase, supabaseUrl, anonKey, emailSecret, row, results);
      } else {
        await processLifecycleRow(supabase, supabaseUrl, anonKey, emailSecret, row, results);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[process-email-queue] Unhandled error for queue row ${row.id}:`, msg);
      await markFailed(supabase, row.id, msg, row.retry_count ?? 0);
      results.failed++;
    }
  }

  console.log('[process-email-queue] Done:', results);
  return jsonResponse({ processed: rows.length, ...results });
});

async function processLifecycleRow(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  anonKey: string,
  emailSecret: string,
  row: QueueRow,
  results: { sent: number; failed: number; skipped: number }
) {
  const idempotencyKey = row.event_key || `${row.type}:${row.business_id}`;

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
  const { data: userResp, error: userErr } = await supabase.auth.admin.getUserById(row.user_id ?? '');
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
  // Server-to-server (sin usuario): solo apikey, nunca Authorization con la
  // client key -- send-email no la usa para este payload (sin `action`), y
  // una publishable key no es JWT, así que no debe ir como Bearer.
  const sendEmailUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/send-email`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': anonKey,
    'x-email-secret': emailSecret,
  };

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
    // Sin más reintentos: marcar como failed definitivo. next_attempt_at
    // se limpia -- wa_claim_email_queue_batch exige next_attempt_at <=
    // now() para reclamar 'failed', así que dejarlo NULL evita que una
    // fila ya agotada vuelva a reclamarse por error.
    const { error } = await supabase
      .from('email_queue')
      .update({ status: 'failed', retry_count: nextRetry, next_attempt_at: null, last_error: reason })
      .eq('id', id);
    if (error) console.error('[process-email-queue] markFailed error:', error.message);
    console.warn(`[process-email-queue] Exhausted retries (id=${id}, retries=${nextRetry}): ${reason}`);
  } else {
    // Reintentar: status='failed' (reintentable, distinto de 'processing')
    // con next_attempt_at diferido (backoff lineal: 30 min × intento).
    // wa_claim_email_queue_batch vuelve a reclamar la fila cuando
    // next_attempt_at <= now() -- por eso el gate es next_attempt_at, no
    // send_at (send_at queda como estaba, es solo el timestamp original de
    // programación, no el de reintento).
    const retryDelay = nextRetry * 30; // minutos
    const retryAt = new Date(Date.now() + retryDelay * 60 * 1000).toISOString();
    const { error } = await supabase
      .from('email_queue')
      .update({ status: 'failed', retry_count: nextRetry, next_attempt_at: retryAt, last_error: reason })
      .eq('id', id);
    if (error) console.error('[process-email-queue] markFailed (retry schedule) error:', error.message);
    console.warn(`[process-email-queue] Will retry in ${retryDelay}min (id=${id}, attempt=${nextRetry}): ${reason}`);
  }
}

async function processPaymentRow(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  anonKey: string,
  emailSecret: string,
  row: QueueRow,
  results: { sent: number; failed: number; skipped: number }
) {
  // EMAIL-PAYMENTS-1 -- payment_received_buyer / payment_received_merchant.
  // Nunca confía en nada guardado al encolar más allá de order_id: relee
  // wa_orders/wa_order_items/wa_order_payments/wa_businesses acá mismo,
  // justo antes de enviar, para que el email siempre refleje el estado
  // real del pedido (nunca un snapshot potencialmente viejo).
  const orderId = typeof row.payload?.order_id === 'string' ? row.payload.order_id : null;
  if (!orderId) {
    console.error(`[process-email-queue] payment row ${row.id} sin order_id en payload -- failed definitivo`);
    await markFailed(supabase, row.id, 'Missing order_id in payload', MAX_RETRIES);
    results.failed++;
    return;
  }

  const { data: order, error: orderErr } = await supabase
    .from('wa_orders')
    .select('id, business_id, customer_name, customer_email, total_amount, currency, paid_at')
    .eq('id', orderId)
    .maybeSingle() as { data: OrderRow | null; error: unknown };

  if (orderErr || !order) {
    console.warn(`[process-email-queue] Order not found for payment row ${row.id} (order_id=${orderId})`);
    await markFailed(supabase, row.id, 'Order not found', MAX_RETRIES);
    results.failed++;
    return;
  }

  const { data: items } = await supabase
    .from('wa_order_items')
    .select('product_name, quantity, subtotal')
    .eq('order_id', orderId) as { data: OrderItemRow[] | null };

  const { data: payment } = await supabase
    .from('wa_order_payments')
    .select('provider, method, provider_payment_id, walinka_fee, mp_fee, net_amount, paid_at')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle() as { data: OrderPaymentRow | null };

  if (!payment) {
    // No debería ocurrir -- merchant-mp-webhook solo encola después de que
    // wa_process_merchant_payment_event ya creó la fila de
    // wa_order_payments en la misma transacción. Si pasa, es una
    // inconsistencia de datos real: nunca se inventa un método de pago.
    console.error(`[process-email-queue] No hay wa_order_payments para el pedido ${orderId} (row=${row.id}) -- failed definitivo, no se inventa el método`);
    await markFailed(supabase, row.id, 'Missing wa_order_payments row for order', MAX_RETRIES);
    results.failed++;
    return;
  }

  const { data: business, error: bizErr } = await supabase
    .from('wa_businesses')
    .select('id, name, slug, email, whatsapp, user_id')
    .eq('id', order.business_id)
    .maybeSingle() as { data: BusinessRow | null; error: unknown };

  if (bizErr || !business) {
    console.warn(`[process-email-queue] Business not found for payment row ${row.id} (business_id=${order.business_id})`);
    await markFailed(supabase, row.id, 'Business not found', MAX_RETRIES);
    results.failed++;
    return;
  }

  const itemsPayload = (items ?? []).map((item) => ({
    name: item.product_name,
    quantity: item.quantity,
    subtotal: item.subtotal,
  }));

  const idempotencyKey = row.event_key || `${row.type}:${orderId}`;
  const sendEmailUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/send-email`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': anonKey,
    'x-email-secret': emailSecret,
  };

  let to: string | null = null;
  let data: Record<string, unknown>;

  if (row.type === 'payment_received_buyer') {
    // El comprador solo se encoló si wa_orders.customer_email ya era
    // válido al momento del pago (wa_enqueue_payment_confirmation_emails).
    // Se re-valida acá igual, por si el dato cambió entre el enqueue y el
    // envío -- nunca se envía a un destino sin re-confirmar.
    to = order.customer_email && order.customer_email.trim() ? order.customer_email.trim() : null;
    if (!to) {
      console.warn(`[process-email-queue] payment_received_buyer sin customer_email para order ${orderId} (row=${row.id}) -- se omite sin fallar`);
      await markFailed(supabase, row.id, 'No customer_email available', MAX_RETRIES);
      results.failed++;
      return;
    }
    data = {
      businessName: business.name,
      businessWhatsapp: business.whatsapp,
      orderId,
      items: itemsPayload,
      total: Number(order.total_amount),
      currency: order.currency,
      paymentMethod: payment.method,
      paidAt: payment.paid_at || order.paid_at,
    };
  } else {
    // payment_received_merchant: wa_businesses.email primero, fallback al
    // email del owner en auth.users -- mismo patrón que
    // wa_queue_welcome_email (COALESCE business.email / auth.users.email).
    to = business.email && business.email.trim() ? business.email.trim() : null;
    if (!to && business.user_id) {
      const { data: ownerResp } = await supabase.auth.admin.getUserById(business.user_id);
      const ownerEmail = (ownerResp?.user as UserRow | null | undefined)?.email;
      if (ownerEmail) to = ownerEmail;
    }
    if (!to) {
      console.warn(`[process-email-queue] payment_received_merchant sin email disponible para business ${business.id} (row=${row.id}) -- se omite sin fallar el pago`);
      await markFailed(supabase, row.id, 'No merchant email available (business.email and owner fallback both empty)', MAX_RETRIES);
      results.failed++;
      return;
    }
    data = {
      name: business.name,
      orderId,
      customerName: order.customer_name,
      items: itemsPayload,
      total: Number(order.total_amount),
      currency: order.currency,
      method: payment.method,
      paidAt: payment.paid_at || order.paid_at,
      walinkaFee: Number(payment.walinka_fee),
      providerPaymentId: payment.provider === 'mercado_pago' ? payment.provider_payment_id : null,
      mpFee: payment.mp_fee,
      netAmount: payment.net_amount,
      dashboardUrl: `https://go.ventalink.app/dashboard`,
    };
  }

  const payload = {
    to,
    type: row.type,
    data,
    businessId: order.business_id,
    idempotencyKey,
    source: 'cron_payment',
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
    console.error(`[process-email-queue] send-email failed for payment row ${row.id}:`, msg);
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

  console.log(`[process-email-queue] Sent ${row.type} to ${to} (row=${row.id})`);
  await markSent(supabase, row.id);
  results.sent++;
}
