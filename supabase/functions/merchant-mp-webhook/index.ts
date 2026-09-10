// merchant-mp-webhook — MP-CHECKOUT-2.
// Confirmación server-side de pagos de clientes finales realizados con
// el checkout Mercado Pago DEL COMERCIO (create-merchant-mp-checkout).
// Completamente aislado del billing de plataforma: no importa ni toca
// mp-webhook, create-mp-preference, wa_payments, wa_payment_events,
// billing_subscriptions, ni lee MP_ACCESS_TOKEN_CL/MP_ACCESS_TOKEN_AR.
//
// Público a propósito (verify_jwt=false): Mercado Pago llama a este
// endpoint directamente desde sus servidores, sin ningún JWT de
// Walinka -- misma razón exacta que mp-webhook de billing.
//
// Principio central: el webhook NUNCA es la fuente de verdad. Del
// body/query solo se extrae la MÍNIMA identidad necesaria para saber
// qué pago consultar y con qué conexión MP -- status, amount,
// currency, business_id, order_id y external_reference SIEMPRE se
// re-derivan de una consulta fresca a la API de Mercado Pago
// (GET /v1/payments/:id), nunca del payload recibido.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSupabaseAdminKeyOrEmpty } from '../_shared/supabaseAdminKey.ts';
import { computeWalinkaMarketplaceFee } from '../_shared/walinkaMarketplaceFee.ts';
import {
  MAX_BODY_BYTES,
  parseWebhookNotification,
  isValidOrderIdHint,
  isKnownMpPaymentStatus,
  parseExternalReference,
  validateReferenceMatch,
  amountsMatch,
  isNonRetryableRpcError,
  toCents,
  resolvePaidAt,
} from './lib.ts';

const MP_PAYMENT_URL = 'https://api.mercadopago.com/v1/payments';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Evento no accionable (malformado, sin match, sin conexión, etc.):
// SIEMPRE 200 -- pedirle a Mercado Pago que reintente algo que no va
// a cambiar solo generaría reintentos infinitos, sin distinguir la
// razón exacta en la respuesta (mismo criterio "sin oráculo" que el
// resto de MP-OAUTH/MP-CHECKOUT).
function ignoredResponse(reason: string) {
  return jsonResponse({ ok: true, ignored: true, reason }, 200);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  }

  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return ignoredResponse('body_too_large');
  }

  // ── 1. Parsear payload -- solo para extraer type/data.id ────────────────
  let body: Record<string, unknown> = {};
  try {
    const rawBody = await req.text();
    body = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
  } catch {
    return ignoredResponse('invalid_json');
  }

  const notification = parseWebhookNotification(body);
  if (!notification) {
    // type != 'payment' (incluye merchant_order, no soportado en esta
    // fase) o sin data.id -- nada que resolver.
    return ignoredResponse('not_supported_type');
  }

  // ── 2. order_id hint (query param de notification_url) -- SOLO para
  //      elegir qué conexión MP probar. Nunca es la fuente de verdad
  //      de a quién pertenece el pago (eso se re-confirma en el paso 6
  //      contra external_reference de la respuesta real de MP). ────────
  const reqUrl = new URL(req.url);
  const orderIdHint = reqUrl.searchParams.get('order_id');
  if (!isValidOrderIdHint(orderIdHint)) {
    console.warn('[merchant-mp-webhook] falta o es inválido el order_id hint en notification_url');
    return ignoredResponse('missing_order_hint');
  }

  const supabaseUrl    = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = getSupabaseAdminKeyOrEmpty();
  if (!serviceRoleKey) {
    console.error('[merchant-mp-webhook] server configuration missing (admin key)');
    return jsonResponse({ ok: false, error: 'Server configuration error' }, 500);
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // ── 3. Resolver order/business desde el hint (paso 1 de la sección 3) ───
  const { data: orderRow, error: orderError } = await admin
    .from('wa_orders')
    .select('id, business_id, total_amount, currency')
    .eq('id', orderIdHint)
    .maybeSingle();

  if (orderError) {
    console.error('[merchant-mp-webhook] error consultando wa_orders:', orderError.message);
    return jsonResponse({ ok: false, error: 'internal_error' }, 500);
  }
  if (!orderRow) {
    console.warn('[merchant-mp-webhook] order_id del hint no existe', { orderIdHint });
    return ignoredResponse('order_not_found');
  }

  // ── 4. Conexión MP del comercio -- misma RPC que create-merchant-mp-checkout
  //      (infraestructura existente, service_role-only) ──────────────────
  const { data: connectionRows, error: connError } = await admin.rpc('wa_get_mp_connection_for_checkout', {
    p_business_id: orderRow.business_id,
  });

  if (connError) {
    console.error('[merchant-mp-webhook] error consultando mp_connection:', connError.message);
    return jsonResponse({ ok: false, error: 'internal_error' }, 500);
  }

  const connection = Array.isArray(connectionRows) ? connectionRows[0] : null;
  if (!connection) {
    console.warn('[merchant-mp-webhook] negocio del hint sin conexión MP activa', { businessId: orderRow.business_id });
    return ignoredResponse('mp_not_connected');
  }
  const mpAccessToken = connection.access_token as string;

  // ── 5. Consultar SIEMPRE Mercado Pago -- fuente de verdad única ─────────
  let mpRes: Response;
  try {
    mpRes = await fetch(`${MP_PAYMENT_URL}/${notification.dataId}`, {
      headers: { Authorization: `Bearer ${mpAccessToken}` },
    });
  } catch (err) {
    console.error('[merchant-mp-webhook] fetch a v1/payments falló:', (err as Error)?.message);
    return jsonResponse({ ok: false, error: 'mp_fetch_failed' }, 502);
  }

  const mpBodyText = await mpRes.text();
  if (!mpRes.ok) {
    if (mpRes.status === 401 || mpRes.status === 404) {
      // El token de este negocio no reconoce el payment -- el hint
      // apuntaba a un negocio equivocado, o el payment no le pertenece.
      console.warn('[merchant-mp-webhook] MP no reconoce el payment para este negocio', {
        businessId: orderRow.business_id, status: mpRes.status,
      });
      return ignoredResponse('payment_not_found_for_business');
    }
    // Solo el status -- nunca el body completo.
    console.error('[merchant-mp-webhook] MP v1/payments respondió error, status:', mpRes.status);
    return jsonResponse({ ok: false, error: 'mp_api_error' }, 502);
  }

  let payment: {
    status?: string;
    status_detail?: string;
    transaction_amount?: number;
    currency_id?: string;
    external_reference?: string;
    date_approved?: string;
  };
  try {
    payment = JSON.parse(mpBodyText);
  } catch {
    console.error('[merchant-mp-webhook] respuesta de MP no es JSON válido');
    return ignoredResponse('invalid_mp_response');
  }

  const mpStatus = String(payment?.status ?? '');
  const mpStatusDetail = payment?.status_detail != null ? String(payment.status_detail) : null;
  const transactionAmount = Number(payment?.transaction_amount);
  const currencyId = String(payment?.currency_id ?? '');
  const externalRefRaw = payment?.external_reference != null ? String(payment.external_reference) : null;
  // MP-PAYMENT-DETAIL-1 -- paid_at de wa_order_payments. Viene SIEMPRE de
  // `payment` (la respuesta ya verificada), nunca del body del webhook.
  // Ver resolvePaidAt() en lib.ts para el criterio exacto de fallback.
  const paidAt = resolvePaidAt(payment?.date_approved ?? null);

  if (!isKnownMpPaymentStatus(mpStatus)) {
    console.warn('[merchant-mp-webhook] status desconocido de Mercado Pago, ignorado', { mpStatus });
    return ignoredResponse('unknown_status');
  }

  // ── 6. Validaciones obligatorias -- SIEMPRE contra la respuesta fresca
  //      de MP, nunca contra el body del webhook ni el hint ────────────────
  const parsedRef = parseExternalReference(externalRefRaw);
  if (!parsedRef) {
    // Cubre: malformada, formato de billing (waP:...), ausente.
    console.warn('[merchant-mp-webhook] external_reference inválida o de billing, ignorado');
    return ignoredResponse('invalid_external_reference');
  }

  if (!validateReferenceMatch(parsedRef, orderRow.business_id as string, orderRow.id as string)) {
    console.warn('[merchant-mp-webhook] external_reference no coincide con el negocio/pedido del hint', {
      businessId: orderRow.business_id, orderId: orderRow.id,
    });
    return ignoredResponse('reference_mismatch');
  }

  if (!amountsMatch(transactionAmount, Number(orderRow.total_amount))) {
    console.warn('[merchant-mp-webhook] amount no coincide con el total del pedido', { orderId: orderRow.id });
    return ignoredResponse('amount_mismatch');
  }

  if (currencyId !== orderRow.currency) {
    console.warn('[merchant-mp-webhook] currency no coincide con el pedido', { orderId: orderRow.id });
    return ignoredResponse('currency_mismatch');
  }

  // ── 6.1. Comisión Walinka (MP-MARKETPLACE-1) -- RE-calculada acá de
  //      forma determinista a partir de wa_orders.total_amount/currency
  //      (orderRow, ya validado arriba contra la respuesta fresca de
  //      MP) -- NUNCA leída de `payment` ni de ningún valor que venga
  //      del webhook. Es la MISMA función pura que usó
  //      create-merchant-mp-checkout al crear la preferencia, así que
  //      sobre el mismo total/moneda produce el mismo resultado
  //      determinista. Si Mercado Pago llegara a incluir información
  //      propia de marketplace_fee en la respuesta, no se usa como
  //      fuente aquí (mantiene esta fase mínima, ver auditoría
  //      MP-MARKETPLACE-0) -- el cálculo server-side sobre el total de
  //      la orden es siempre la fuente primaria, nunca se debilitan las
  //      validaciones de amount/currency/reference ya hechas arriba. Un
  //      fallo acá (no debería ocurrir: orderRow.currency ya viene de
  //      resolveCheckoutCurrency en creación) no bloquea la
  //      confirmación del pago/stock -- solo se registra walinka_fee=0
  //      y se loguea para reconciliación manual.
  const feeResult = computeWalinkaMarketplaceFee(toCents(Number(orderRow.total_amount)), orderRow.currency as string);
  if (!feeResult.ok) {
    console.error('[merchant-mp-webhook] no se pudo calcular la comisión Walinka esperada, se persiste 0 para reconciliación manual:', feeResult.reason, { orderId: orderRow.id });
  }
  const walinkaFee = feeResult.ok ? feeResult.fee : 0;

  // ── 7. Transición atómica -- idempotente, stock aplicado a lo sumo 1 vez ─
  const { data: rpcRows, error: rpcError } = await admin.rpc('wa_process_merchant_payment_event', {
    p_business_id: orderRow.business_id,
    p_order_id: orderRow.id,
    p_mp_payment_id: notification.dataId,
    p_mp_status: mpStatus,
    p_mp_status_detail: mpStatusDetail,
    p_amount: transactionAmount,
    p_currency: currencyId,
    p_external_reference: externalRefRaw,
    p_walinka_fee: walinkaFee,
    p_paid_at: paidAt,
  });

  if (rpcError) {
    if (isNonRetryableRpcError(rpcError.message)) {
      console.error('[merchant-mp-webhook] evento rechazado por la RPC (no reintentable):', rpcError.message, { orderId: orderRow.id });
      return ignoredResponse('event_rejected');
    }
    console.error('[merchant-mp-webhook] error procesando el evento de pago:', rpcError.message, { orderId: orderRow.id });
    return jsonResponse({ ok: false, error: 'internal_error' }, 500);
  }

  const result = rpcRows?.[0];
  console.log('[merchant-mp-webhook] payment_event_processed', {
    businessId: orderRow.business_id,
    orderId: orderRow.id,
    mpPaymentId: notification.dataId,
    mpStatus,
    appliedNow: result?.applied_now ?? null,
    alreadyProcessed: result?.already_processed ?? null,
    walinkaFee,
    paidAt,
  });

  return jsonResponse({ ok: true }, 200);
});
