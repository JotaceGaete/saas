// Browser client for the fiscal queue. Never holds credentials; the server
// enforces session and business ownership on every call.
export const FISCAL_STATUS_LABELS = Object.freeze({
  pending: 'Pendiente de emisión',
  sending: 'Emitiendo…',
  unknown: 'Requiere conciliación',
  issued: 'Emitida',
  failed: 'Fallida',
  cancelled: 'Cancelada',
});

// Only pending rows can be emitted from the panel. Everything else is informational.
export function canEmitFromQueue(status) {
  return status === 'pending';
}

export async function fetchFiscalQueue({ businessId, accessToken, fetchImpl = fetch }) {
  const response = await fetchImpl(`/api/fiscal/queue?businessId=${encodeURIComponent(businessId)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
    credentials: 'same-origin',
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, status: response.status, error: body?.error || 'REQUEST_FAILED' };
  return { ok: true, items: body.items || [], counts: body.counts || {} };
}

export async function emitPendingFromQueue({ businessId, invoiceId, accessToken, fetchImpl = fetch }) {
  const response = await fetchImpl('/api/fiscal/queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ businessId, invoiceId }),
    cache: 'no-store',
    credentials: 'same-origin',
  });
  const body = await response.json().catch(() => null);
  if (response.status >= 500) {
    // Outcome unknown: the provider may have received the request. Never retry here.
    return { state: 'unknown', reason: body?.error || 'NETWORK_OR_SERVER_ERROR' };
  }
  if (!response.ok) return { state: 'blocked', reason: body?.reason || body?.error || `HTTP_${response.status}` };
  return body && typeof body.state === 'string' ? body : { state: 'unknown', reason: 'UNEXPECTED_SERVER_RESPONSE' };
}
