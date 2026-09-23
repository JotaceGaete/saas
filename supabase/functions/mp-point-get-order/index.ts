// mp-point-get-order — POINT-SMART-2-5B.
// Consulta a Mercado Pago la fuente de verdad de una operación Point y
// sincroniza su ledger local. NO finaliza la venta todavía.

import {
  MP_ORDERS_URL, MP_ALLOWED_STATUSES, pointCorsHeaders, pointJson,
  resolvePointContext, sanitizePointOrder,
} from '../_shared/mpPoint.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: pointCorsHeaders });
  if (req.method !== 'POST') return pointJson({ error: 'Method not allowed', reason: 'INVALID_REQUEST' }, 405);

  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown>; } catch { return pointJson({ error: 'Invalid JSON', reason: 'INVALID_REQUEST' }, 400); }
  if (body.businessId !== undefined || body.orderId !== undefined) console.warn('[mp-point-get-order] authority identifiers ignored');

  const operationId = typeof body.operationId === 'string' ? body.operationId.trim() : '';
  if (!UUID_RE.test(operationId)) return pointJson({ error: 'Invalid operationId', reason: 'INVALID_REQUEST' }, 400);

  const ctx = await resolvePointContext((req.headers.get('authorization') ?? '').trim());
  if (!ctx.ok) return ctx.response;

  const { data: operation, error } = await ctx.admin.from('crm_pos_point_operations')
    .select('*').eq('id', operationId).eq('business_id', ctx.businessId).maybeSingle();
  if (error) return pointJson({ error: 'Could not read Point operation' }, 500);
  if (!operation) return pointJson({ error: 'Point operation not found', reason: 'POINT_OPERATION_NOT_FOUND' }, 404);
  if (!operation.mp_order_id) {
    return pointJson({
      ok: true, operation_id: operation.id, order_id: null,
      status: operation.mp_status, status_detail: operation.mp_status_detail,
    }, 200);
  }

  let mpRes: Response;
  try {
    mpRes = await fetch(`${MP_ORDERS_URL}/${encodeURIComponent(operation.mp_order_id)}`, {
      headers: { Authorization: `Bearer ${ctx.accessToken}`, 'Content-Type': 'application/json' },
    });
  } catch {
    return pointJson({ error: 'Mercado Pago unavailable', reason: 'MP_GET_UNAVAILABLE' }, 502);
  }

  const raw = await mpRes.text();
  if (!mpRes.ok) {
    console.error('[mp-point-get-order] MP get error status:', mpRes.status, { businessId: ctx.businessId, operationId });
    return pointJson({ error: 'Could not get Point order', reason: 'MP_GET_FAILED' }, mpRes.status === 404 ? 404 : 502);
  }

  let order;
  try { order = sanitizePointOrder(JSON.parse(raw)); }
  catch { return pointJson({ error: 'Invalid Mercado Pago response', reason: 'MP_GET_FAILED' }, 502); }

  // Correlación doble: tanto id como external_reference deben coincidir.
  if (order.id !== operation.mp_order_id || order.external_reference !== operation.external_reference) {
    console.error('[mp-point-get-order] correlation mismatch', { businessId: ctx.businessId, operationId });
    return pointJson({ error: 'Mercado Pago order correlation mismatch', reason: 'MP_ORDER_MISMATCH' }, 409);
  }
  if (!order.status || !MP_ALLOWED_STATUSES.has(order.status)) {
    console.error('[mp-point-get-order] unknown MP status:', order.status, { businessId: ctx.businessId, operationId });
    return pointJson({ error: 'Unsupported Mercado Pago order status', reason: 'MP_STATUS_UNKNOWN' }, 502);
  }

  const update: Record<string, unknown> = {
    mp_status: order.status,
    mp_status_detail: order.status_detail,
    mp_payment_id: order.payment_id,
  };
  if (order.status === 'processed' && !operation.processed_at) update.processed_at = new Date().toISOString();

  const { error: syncError } = await ctx.admin.from('crm_pos_point_operations').update(update).eq('id', operation.id);
  if (syncError) {
    console.error('[mp-point-get-order] local sync failed:', syncError.message, { businessId: ctx.businessId, operationId });
    return pointJson({ error: 'Order read but local sync failed', reason: 'LOCAL_SYNC_FAILED' }, 500);
  }

  return pointJson({
    ok: true,
    operation_id: operation.id,
    order_id: order.id,
    status: order.status,
    status_detail: order.status_detail,
    payment_id: order.payment_id,
    payment_status: order.payment_status,
    payment_status_detail: order.payment_status_detail,
    amount: order.amount,
    finalized: !!operation.crm_invoice_id,
    invoice_id: operation.crm_invoice_id ?? null,
  }, 200);
});
