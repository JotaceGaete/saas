// Fires the server-side fiscal emission after a Point sale was finalized.
// Never throws and never retries: a failure here must not undo the payment
// flow. Emission is idempotent and gated server-side (simulation-only).
// Required secrets: FISCAL_EMIT_POINT_URL and FISCAL_INTERNAL_SECRET.
export async function requestPointBoletaEmission(businessId: string, invoiceId: string): Promise<void> {
  const url = Deno.env.get('FISCAL_EMIT_POINT_URL');
  const secret = Deno.env.get('FISCAL_INTERNAL_SECRET');
  if (!url || !secret) {
    console.error('[fiscal] emission not configured', { businessId, invoiceId });
    return;
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-fiscal-internal-secret': secret },
      body: JSON.stringify({ businessId, invoiceId }),
      signal: AbortSignal.timeout(20000),
    });
    console.log('[fiscal] point emission response', { businessId, invoiceId, status: res.status });
  } catch (error) {
    console.error('[fiscal] point emission request failed', { businessId, invoiceId, error: String(error) });
  }
}
