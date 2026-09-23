// mp-point-create-order — POINT-SMART-2-5A.
// Crea (o recupera idempotentemente) una order Point. El total NO se acepta
// desde el browser: se calcula server-side desde las líneas + descuento.
// Esta fase persiste el snapshot para recuperación, pero NO crea crm_invoice,
// NO mueve caja y NO descuenta stock.

import {
  MP_ORDERS_URL, MP_TERMINALS_URL, MP_ALLOWED_STATUSES, pointCorsHeaders, pointJson,
  resolvePointContext, sanitizePointOrder,
} from '../_shared/mpPoint.ts';

const MAX_BODY_BYTES = 64 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ITEMS = 200;
const MAX_NAME = 300;
const MAX_NOTE = 1000;

type SaleItem = { product_id: string | null; name: string; unit_price: number; quantity: number; note: string | null };

function money(n: number): number { return Math.round((n + Number.EPSILON) * 100) / 100; }
function cleanText(v: unknown, max: number): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

function parseItems(raw: unknown): { ok: true; items: SaleItem[] } | { ok: false } {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_ITEMS) return { ok: false };
  const items: SaleItem[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') return { ok: false };
    const o = x as Record<string, unknown>;
    const productId = o.product_id === null || o.product_id === undefined || o.product_id === ''
      ? null : typeof o.product_id === 'string' && UUID_RE.test(o.product_id) ? o.product_id : '__invalid__';
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    const price = Number(o.unit_price);
    const qty = Number(o.quantity);
    if (productId === '__invalid__' || !name || name.length > MAX_NAME || !Number.isFinite(price) || price < 0 ||
        !Number.isInteger(qty) || qty <= 0) return { ok: false };
    items.push({ product_id: productId, name, unit_price: money(price), quantity: qty, note: cleanText(o.note, MAX_NOTE) });
  }
  return { ok: true, items };
}

async function terminalIsPdv(accessToken: string, terminalId: string): Promise<boolean | null> {
  try {
    const res = await fetch(`${MP_TERMINALS_URL}?limit=50&offset=0`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) return null;
    const payload = await res.json();
    const terminals = Array.isArray(payload?.data?.terminals) ? payload.data.terminals : [];
    const t = terminals.find((x: Record<string, unknown>) => String(x?.id ?? '') === terminalId);
    return !!t && String(t?.operating_mode ?? '') === 'PDV';
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: pointCorsHeaders });
  if (req.method !== 'POST') return pointJson({ error: 'Method not allowed', reason: 'INVALID_REQUEST' }, 405);

  const len = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(len) && len > MAX_BODY_BYTES) return pointJson({ error: 'Request too large', reason: 'INVALID_REQUEST' }, 400);

  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown>; } catch { return pointJson({ error: 'Invalid JSON', reason: 'INVALID_REQUEST' }, 400); }
  if (body.businessId !== undefined || body.amount !== undefined || body.total !== undefined || body.currency !== undefined) {
    console.warn('[mp-point-create-order] authority fields from browser ignored');
  }

  const terminalId = typeof body.terminalId === 'string' ? body.terminalId.trim() : '';
  const createKey = typeof body.createIdempotencyKey === 'string' ? body.createIdempotencyKey.trim() : '';
  const saleKey = typeof body.saleIdempotencyKey === 'string' ? body.saleIdempotencyKey.trim() : '';
  const issueDate = typeof body.issueDate === 'string' ? body.issueDate.trim() : '';
  const customerId = body.customerId === null || body.customerId === undefined || body.customerId === ''
    ? null : typeof body.customerId === 'string' && UUID_RE.test(body.customerId) ? body.customerId : '__invalid__';
  const discount = money(Math.max(0, Number(body.discount ?? 0)));
  const notes = cleanText(body.notes, 2000);
  const parsed = parseItems(body.items);

  if (!terminalId || terminalId.length > 200 || !UUID_RE.test(createKey) || !saleKey || saleKey.length > 200 ||
      !DATE_RE.test(issueDate) || customerId === '__invalid__' || !Number.isFinite(discount) || !parsed.ok) {
    return pointJson({ error: 'Invalid Point sale request', reason: 'INVALID_REQUEST' }, 400);
  }

  const ctx = await resolvePointContext((req.headers.get('authorization') ?? '').trim());
  if (!ctx.ok) return ctx.response;

  // Si la misma key ya existe, reutilizamos SIEMPRE el snapshot persistido.
  // Esto permite reintentar POST /v1/orders con el mismo X-Idempotency-Key
  // después de una respuesta de red ambigua sin cobrar dos veces.
  const { data: existing } = await ctx.admin
    .from('crm_pos_point_operations')
    .select('*')
    .eq('business_id', ctx.businessId)
    .eq('create_idempotency_key', createKey)
    .maybeSingle();

  let operation = existing;
  if (!operation) {
    // Validar referencias de producto/cliente contra el tenant. El TPV permite
    // precio editable y líneas manuales por diseño; por eso el servidor
    // recalcula el TOTAL desde las líneas recibidas, pero no sustituye el
    // unit_price por el precio de catálogo.
    const productIds = [...new Set(parsed.items.map((x) => x.product_id).filter(Boolean))] as string[];
    if (productIds.length) {
      const { data: products, error } = await ctx.admin
        .from('wa_products').select('id, stock_actual').eq('business_id', ctx.businessId).in('id', productIds);
      if (error || (products?.length ?? 0) !== productIds.length) return pointJson({ error: 'Product not found', reason: 'PRODUCT_NOT_FOUND' }, 409);
      const byId = new Map((products ?? []).map((p: Record<string, unknown>) => [String(p.id), p]));
      const requested = new Map<string, number>();
      for (const item of parsed.items) if (item.product_id) requested.set(item.product_id, (requested.get(item.product_id) ?? 0) + item.quantity);
      for (const [id, qty] of requested) {
        const stock = byId.get(id)?.stock_actual;
        if (stock !== null && stock !== undefined && Number(stock) < qty) return pointJson({ error: 'Insufficient stock', reason: 'STOCK_INSUFFICIENT', product_id: id }, 409);
      }
    }
    if (customerId) {
      const { data: customer } = await ctx.admin.from('wa_customers').select('id').eq('business_id', ctx.businessId).eq('id', customerId).maybeSingle();
      if (!customer) return pointJson({ error: 'Customer not found', reason: 'CUSTOMER_NOT_FOUND' }, 409);
    }

    const subtotal = money(parsed.items.reduce((s, x) => s + money(x.unit_price * x.quantity), 0));
    const appliedDiscount = Math.min(discount, subtotal);
    const total = money(subtotal - appliedDiscount);
    // Orders Point exige amount entero sin decimales. CLP naturalmente cumple;
    // en ARS rechazamos fracciones en vez de redondear silenciosamente.
    if (total <= 0 || !Number.isInteger(total)) return pointJson({ error: 'Point amount must be a positive integer', reason: 'INVALID_POINT_AMOUNT' }, 400);

    const pdv = await terminalIsPdv(ctx.accessToken, terminalId);
    if (pdv === null) return pointJson({ error: 'Could not verify Point terminal', reason: 'MP_TERMINALS_FAILED' }, 502);
    if (!pdv) return pointJson({ error: 'Point terminal not found or not in PDV mode', reason: 'TERMINAL_NOT_PDV' }, 409);

    // Point es un pago real: debe nacer dentro de una caja abierta. Se guarda
    // el id exacto para que la finalización/recovery nunca cambie de turno.
    const { data: cashSession, error: cashError } = await ctx.admin
      .from('crm_cash_sessions')
      .select('id')
      .eq('business_id', ctx.businessId)
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cashError) return pointJson({ error: 'Could not verify cash session', reason: 'CASH_LOOKUP_FAILED' }, 500);
    if (!cashSession?.id) return pointJson({ error: 'Open cash session required', reason: 'NO_OPEN_CASH' }, 409);

    const operationId = crypto.randomUUID();
    const externalReference = `wpt_${operationId.replaceAll('-', '')}`;
    const snapshot = {
      items: parsed.items,
      customer_id: customerId,
      discount: appliedDiscount,
      notes,
      issue_date: issueDate,
      currency: ctx.currency,
    };

    const { data: inserted, error: insertError } = await ctx.admin
      .from('crm_pos_point_operations')
      .insert({
        id: operationId, business_id: ctx.businessId, created_by: ctx.userId,
        cash_session_id: cashSession.id,
        terminal_id: terminalId, external_reference: externalReference,
        create_idempotency_key: createKey, sale_idempotency_key: saleKey,
        sale_snapshot: snapshot, amount: total, currency: ctx.currency, mp_status: 'creating',
      })
      .select('*').single();

    if (insertError) {
      // Carrera con el mismo createKey: releer la fila ganadora.
      const { data: raced } = await ctx.admin.from('crm_pos_point_operations').select('*')
        .eq('business_id', ctx.businessId).eq('create_idempotency_key', createKey).maybeSingle();
      if (!raced) {
        console.error('[mp-point-create-order] operation insert failed:', insertError.message, { businessId: ctx.businessId });
        return pointJson({ error: 'Could not persist Point operation', reason: 'POINT_OPERATION_FAILED' }, 500);
      }
      operation = raced;
    } else {
      operation = inserted;
    }
  }

  if (operation.mp_order_id) {
    return pointJson({
      ok: true, operation_id: operation.id, order_id: operation.mp_order_id,
      status: operation.mp_status, status_detail: operation.mp_status_detail,
    }, 200);
  }

  // Reintento seguro incluso si una llamada anterior obtuvo resultado ambiguo:
  // misma operation, mismo payload persistido, misma X-Idempotency-Key.
  const payload = {
    type: 'point',
    external_reference: operation.external_reference,
    expiration_time: 'PT10M',
    transactions: { payments: [{ amount: String(operation.amount) }] },
    config: { point: { terminal_id: operation.terminal_id, print_on_terminal: 'no_ticket' } },
    description: 'Venta Walinka',
  };

  let mpRes: Response;
  try {
    mpRes = await fetch(MP_ORDERS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': String(operation.create_idempotency_key),
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn('[mp-point-create-order] ambiguous network result:', (err as Error)?.message, { businessId: ctx.businessId, operationId: operation.id });
    return pointJson({ error: 'Point order result is uncertain; retry with the same key', reason: 'MP_CREATE_AMBIGUOUS', operation_id: operation.id }, 503);
  }

  const raw = await mpRes.text();
  if (!mpRes.ok) {
    await ctx.admin.from('crm_pos_point_operations')
      .update({ mp_status_detail: `create_http_${mpRes.status}` }).eq('id', operation.id);
    console.error('[mp-point-create-order] MP create error status:', mpRes.status, { businessId: ctx.businessId, operationId: operation.id });
    return pointJson({ error: 'Could not create Point order', reason: 'MP_CREATE_FAILED', operation_id: operation.id }, mpRes.status >= 500 ? 502 : 409);
  }

  let sanitized;
  try { sanitized = sanitizePointOrder(JSON.parse(raw)); }
  catch { return pointJson({ error: 'Invalid Mercado Pago response', reason: 'MP_CREATE_AMBIGUOUS', operation_id: operation.id }, 502); }

  if (!sanitized.id || sanitized.external_reference !== operation.external_reference || !sanitized.status) {
    return pointJson({ error: 'Mercado Pago response could not be correlated', reason: 'MP_CREATE_AMBIGUOUS', operation_id: operation.id }, 502);
  }
  if (!MP_ALLOWED_STATUSES.has(sanitized.status)) {
    console.error('[mp-point-create-order] unknown MP status:', sanitized.status, { businessId: ctx.businessId, operationId: operation.id });
    return pointJson({ error: 'Unsupported Mercado Pago order status', reason: 'MP_STATUS_UNKNOWN', operation_id: operation.id, order_id: sanitized.id }, 502);
  }

  const { error: updateError } = await ctx.admin.from('crm_pos_point_operations').update({
    mp_order_id: sanitized.id,
    mp_payment_id: sanitized.payment_id,
    mp_status: sanitized.status,
    mp_status_detail: sanitized.status_detail,
    processed_at: sanitized.status === 'processed' ? new Date().toISOString() : null,
  }).eq('id', operation.id);

  if (updateError) {
    console.error('[mp-point-create-order] order created but local update failed:', updateError.message, { businessId: ctx.businessId, operationId: operation.id, orderId: sanitized.id });
    return pointJson({ error: 'Point order created but local confirmation is pending', reason: 'LOCAL_CONFIRMATION_PENDING', operation_id: operation.id, order_id: sanitized.id }, 202);
  }

  return pointJson({
    ok: true, operation_id: operation.id, order_id: sanitized.id,
    status: sanitized.status, status_detail: sanitized.status_detail,
  }, 201);
});
