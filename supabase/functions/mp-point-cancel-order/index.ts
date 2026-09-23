// mp-point-cancel-order — POINT-SMART-2-5C.
// Cancela vía API únicamente una order cuyo estado authoritative todavía es
// 'created'. Si ya llegó a la terminal (at_terminal), la API de MP exige
// cancelarla físicamente desde la Point.

import {
  MP_ORDERS_URL, MP_ALLOWED_STATUSES, pointCorsHeaders, pointJson,
  resolvePointContext, sanitizePointOrder,
} from '../_shared/mpPoint.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getAuthoritative(accessToken: string, orderId: string) {
  try {
    const res = await fetch(`${MP_ORDERS_URL}/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    });
    const raw = await res.text();
    if (!res.ok) return { ok: false as const, status: res.status };
    return { ok: true as const, order: sanitizePointOrder(JSON.parse(raw)) };
  } catch {
    return { ok: false as const, status: 502 };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: pointCorsHeaders });
  if (req.method !== 'POST') return pointJson({ error: 'Method not allowed', reason: 'INVALID_REQUEST' }, 405);

  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown>; } catch { return pointJson({ error: 'Invalid JSON', reason: 'INVALID_REQUEST' }, 400); }
  if (body.businessId !== undefined || body.orderId !== undefined || body.idempotencyKey !== undefined) {
    console.warn('[mp-point-cancel-order] authority identifiers ignored');
  }
  const operationId = typeof body.operationId === 'string' ? body.operationId.trim() : '';
  if (!UUID_RE.test(operationId)) return pointJson({ error: 'Invalid operationId', reason: 'INVALID_REQUEST' }, 400);

  const ctx = await resolvePointContext((req.headers.get('authorization') ?? '').trim());
  if (!ctx.ok) return ctx.response;

  const { data: operation, error } = await ctx.admin.from('crm_pos_point_operations')
    .select('*').eq('id', operationId).eq('business_id', ctx.businessId).maybeSingle();
  if (error) return pointJson({ error: 'Could not read Point operation' }, 500);
  if (!operation) return pointJson({ error: 'Point operation not found', reason: 'POINT_OPERATION_NOT_FOUND' }, 404);
  if (!operation.mp_order_id) return pointJson({ error: 'Point order has not been created yet', reason: 'ORDER_NOT_CREATED' }, 409);

  // Antes de cancelar, reconsultar siempre MP. Nunca decidir con estado local
  // potencialmente atrasado.
  const before = await getAuthoritative(ctx.accessToken, operation.mp_order_id);
  if (!before.ok) return pointJson({ error: 'Could not verify Point order', reason: 'MP_GET_FAILED' }, before.status === 404 ? 404 : 502);
  const order = before.order;
  if (order.id !== operation.mp_order_id || order.external_reference !== operation.external_reference) {
    return pointJson({ error: 'Mercado Pago order correlation mismatch', reason: 'MP_ORDER_MISMATCH' }, 409);
  }
  if (!order.status || !MP_ALLOWED_STATUSES.has(order.status)) return pointJson({ error: 'Unsupported Mercado Pago order status', reason: 'MP_STATUS_UNKNOWN' }, 502);

  // Sincronizar aun cuando no sea cancelable.
  await ctx.admin.from('crm_pos_point_operations').update({
    mp_status: order.status, mp_status_detail: order.status_detail, mp_payment_id: order.payment_id,
    ...(order.status === 'processed' && !operation.processed_at ? { processed_at: new Date().toISOString() } : {}),
  }).eq('id', operation.id);

  if (order.status === 'canceled') {
    return pointJson({ ok: true, changed: false, operation_id: operation.id, order_id: order.id, status: 'canceled' }, 200);
  }
  if (order.status === 'at_terminal') {
    return pointJson({
      error: 'Cancel the payment on the Point terminal',
      reason: 'CANCEL_ON_TERMINAL_REQUIRED',
      operation_id: operation.id, order_id: order.id, status: order.status,
    }, 409);
  }
  if (order.status !== 'created') {
    return pointJson({
      error: 'Point order can no longer be canceled by API',
      reason: 'ORDER_NOT_CANCELABLE',
      operation_id: operation.id, order_id: order.id, status: order.status,
    }, 409);
  }

  let cancelRes: Response;
  try {
    cancelRes = await fetch(`${MP_ORDERS_URL}/${encodeURIComponent(operation.mp_order_id)}/cancel`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': String(operation.cancel_idempotency_key),
      },
    });
  } catch {
    return pointJson({ error: 'Cancellation result is uncertain; verify order before retrying', reason: 'MP_CANCEL_AMBIGUOUS' }, 503);
  }

  const raw = await cancelRes.text();
  if (!cancelRes.ok) {
    console.error('[mp-point-cancel-order] MP cancel error status:', cancelRes.status, { businessId: ctx.businessId, operationId });
    // El estado puede haber cambiado entre GET y POST. No inventar resultado:
    // la UI debe consultar nuevamente antes de cualquier acción.
    return pointJson({ error: 'Could not confirm Point cancellation', reason: 'MP_CANCEL_UNCONFIRMED' }, cancelRes.status >= 500 ? 502 : 409);
  }

  let canceled;
  try { canceled = sanitizePointOrder(JSON.parse(raw)); }
  catch { return pointJson({ error: 'Cancellation accepted but result could not be verified', reason: 'MP_CANCEL_UNCONFIRMED' }, 202); }

  if (canceled.id !== operation.mp_order_id || canceled.external_reference !== operation.external_reference) {
    return pointJson({ error: 'Cancellation response correlation mismatch', reason: 'MP_ORDER_MISMATCH' }, 409);
  }

  // Releer después de cancelar: GET es la confirmación authoritative.
  const after = await getAuthoritative(ctx.accessToken, operation.mp_order_id);
  if (!after.ok || after.order.status !== 'canceled') {
    return pointJson({ error: 'Cancellation accepted but final state is pending verification', reason: 'MP_CANCEL_UNCONFIRMED' }, 202);
  }

  await ctx.admin.from('crm_pos_point_operations').update({
    mp_status: 'canceled',
    mp_status_detail: after.order.status_detail,
    mp_payment_id: after.order.payment_id,
  }).eq('id', operation.id);

  return pointJson({
    ok: true, changed: true, operation_id: operation.id,
    order_id: operation.mp_order_id, status: 'canceled',
  }, 200);
});
