// Trusted server-to-server handoff after a verified Point sale is finalized.
// Never retries a fiscal POST: an ambiguous provider outcome requires reconciliation.
// Required secrets on Supabase: FISCAL_EMIT_POINT_URL, FISCAL_INTERNAL_SECRET.
// Matching FISCAL_INTERNAL_SECRET must be configured on Vercel.
export async function requestPointBoletaEmission(businessId: string, invoiceId: string): Promise<void> {
  const url = Deno.env.get('FISCAL_EMIT_POINT_URL');
  const secret = Deno.env.get('FISCAL_INTERNAL_SECRET');
  if (!url || !secret) {
    console.error('[fiscal] handoff not configured; paid sale requires follow-up', { businessId, invoiceId });
    return;
  }

  // Prevent accidental calls to an arbitrary endpoint or plain HTTP.
  let target: URL;
  try {
    target = new URL(url);
    if (target.protocol !== 'https:' || target.username || target.password ||
        target.search || target.hash || target.pathname !== '/api/fiscal/emit-point') {
      throw new Error('Invalid fiscal endpoint');
    }
  } catch {
    console.error('[fiscal] invalid handoff URL; paid sale requires follow-up', { businessId, invoiceId });
    return;
  }

  try {
    const res = await fetch(target.toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-fiscal-internal-secret': secret },
      body: JSON.stringify({ businessId, invoiceId }),
      signal: AbortSignal.timeout(20000),
    });
    // 409 means the operation was already claimed, not that a DTE was issued.
    // Only the fiscal repository / provider reconciliation establishes issuance.
    let result: { state?: unknown; reason?: unknown } | null = null;
    try { result = await res.json(); } catch { /* body may be unavailable */ }
    const state = typeof result?.state === 'string' ? result.state : null;
    const reason = typeof result?.reason === 'string' ? result.reason : null;
    if (res.ok && state === 'issued') {
      console.log('[fiscal] Point DTE issued; consult fiscal record for document', { businessId, invoiceId });
    } else {
      console.error('[fiscal] Point DTE requires follow-up', {
        businessId, invoiceId, httpStatus: res.status, state, reason,
      });
    }
  } catch (error) {
    console.error('[fiscal] handoff failed; paid sale requires reconciliation, no automatic retry', {
      businessId, invoiceId, error: String(error),
    });
  }
}
