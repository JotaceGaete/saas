const MP_ORDERS_URL = 'https://api.mercadopago.com/v1/orders';

function asString(value) {
  return typeof value === 'string' ? value : typeof value === 'number' && Number.isFinite(value) ? String(value) : null;
}

/** Only a sanitized representation is allowed to reach fiscal validation. */
export function sanitizeFiscalPointOrder(raw) {
  const order = raw && typeof raw === 'object' ? raw : {};
  const transactions = order.transactions && typeof order.transactions === 'object' ? order.transactions : {};
  const payments = Array.isArray(transactions.payments) ? transactions.payments : [];
  // Multiple payment transactions cannot be represented safely by this pilot.
  if (payments.length !== 1) return null;
  const payment = payments[0] && typeof payments[0] === 'object' ? payments[0] : {};
  return {
    id: asString(order.id),
    external_reference: asString(order.external_reference),
    status: asString(order.status),
    payment_id: asString(payment.id),
    payment_status: asString(payment.status),
    amount: asString(payment.amount),
  };
}

/**
 * Read Mercado Pago using the business-specific OAuth token obtained by a
 * trusted backend from wa_get_mp_point_connection. Never pass a client token.
 */
export function createFiscalPointOrderFetcher({ loadConnection, fetchImpl = fetch }) {
  if (typeof loadConnection !== 'function' || typeof fetchImpl !== 'function') {
    throw new Error('Trusted Point connection loader required');
  }
  return async function fetchProviderOrder({ businessId, orderId }) {
    if (!businessId || !orderId) throw new Error('Point identity required');
    const connection = await loadConnection({ businessId });
    if (!connection?.access_token) throw new Error('Point connection unavailable');
    const response = await fetchImpl(`${MP_ORDERS_URL}/${encodeURIComponent(orderId)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${connection.access_token}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('Mercado Pago order lookup failed');
    const order = sanitizeFiscalPointOrder(await response.json());
    if (!order || order.id !== orderId) throw new Error('Invalid Point order response');
    return order;
  };
}

/** Service-role RPC loader; use only inside a trusted worker. */
export function createFiscalPointConnectionLoader(admin) {
  if (!admin?.rpc) throw new Error('Trusted Supabase client required');
  return async ({ businessId }) => {
    const { data, error } = await admin.rpc('wa_get_mp_point_connection', {
      p_business_id: businessId,
    });
    if (error) throw new Error('Could not load Point connection');
    const rows = Array.isArray(data) ? data : [];
    if (rows.length !== 1 || !rows[0]?.access_token) {
      throw new Error('Point connection unavailable or ambiguous');
    }
    return { access_token: rows[0].access_token };
  };
}
