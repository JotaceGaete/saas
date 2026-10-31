/**
 * Explicit fiscal bridge for a completed TPV sale.
 * Never calls the provider directly, never retries a fiscal POST.
 * Production emission remains disabled on the server until separately authorized.
 */
export async function requestCashBoletaForCompletedSale({
  businessId, invoiceId, accessToken, fetchImpl = fetch,
}) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(businessId || '') ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(invoiceId || '')) {
    return { state: 'blocked', reason: 'INVALID_SALE_REFERENCE' };
  }
  if (typeof accessToken !== 'string' || !accessToken) {
    return { state: 'blocked', reason: 'SESSION_REQUIRED' };
  }
  // The backend independently reloads the sale, its payment, the issuer and
  // the cashier's permissions. Browser-supplied totals are never trusted.
  try {
    const response = await fetchImpl('/api/siisolutions-manual-cash', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ businessId, invoiceId }),
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 409 && body?.state === 'already_claimed') {
        return { state: 'already_claimed', reason: 'RECONCILIATION_REQUIRED' };
      }
      if (response.status >= 500 || body?.error === 'ISSUANCE_OUTCOME_REQUIRES_REVIEW') {
        return { state: 'unknown', reason: body?.error || `HTTP_${response.status}_RECONCILIATION_REQUIRED` };
      }
      return {
        state: 'blocked',
        reason: body?.error || body?.reason || `HTTP_${response.status}`,
      };
    }
    return body && typeof body.state === 'string'
      ? body
      : { state: 'unknown', reason: 'UNEXPECTED_SERVER_RESPONSE' };
  } catch {
    // A network error does NOT mean the DTE was not issued.
    // Never retry automatically; reconcile by sale ID first.
    return { state: 'unknown', reason: 'NETWORK_ERROR_RECONCILIATION_REQUIRED' };
  }
}
