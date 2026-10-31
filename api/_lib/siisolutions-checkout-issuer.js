import { buildBoletaPayload, SII_BASE_URL, SII_EMISSION_PATHS } from './siisolutions-adapter.js';
import { assessBoletaEligibility } from './siisolutions-payment-eligibility.js';
import { operationIdForSale, reconcileProviderOutcome } from './siisolutions-issuance-state.js';

/**
 * Shared fiscal emission for cashier-confirmed cash and server-verified Point.
 * Only call with payment records reloaded by a trusted backend.
 * Pilot remains sandbox-only; never pass the production API URL.
 */
export async function issueCheckoutBoleta({
  sale, payment, businessId, issuerBusinessId, operatorRut,
  apiKey, repository, sandboxBaseUrl, fetchImpl = fetch,
}) {
  const check = assessBoletaEligibility({ sale, payment, businessId, issuerBusinessId });
  if (!check.eligible) return { state: 'blocked', reason: check.reason };

  const mode = process.env.SIISOLUTIONS_EMISSION_ENABLED;
  if (!['simulation', 'live'].includes(mode) ||
      !sandboxBaseUrl || !/^https:\/\//.test(sandboxBaseUrl) ||
      (mode === 'live' ? new URL(sandboxBaseUrl).origin !== SII_BASE_URL : new URL(sandboxBaseUrl).hostname === new URL(SII_BASE_URL).hostname)) {
    return { state: 'blocked', reason: 'FISCAL_PROVIDER_NOT_CONFIGURED' };
  }
  if (!apiKey || !repository?.claimPending || !repository?.finalize) {
    throw new Error('Trusted fiscal repository and provider credentials required');
  }

  const operationId = operationIdForSale(businessId, sale.id);
  // Validate entire payload before claiming a fiscal operation.
  const payload = buildBoletaPayload({
    id: operationId, operatorRut, total: sale.total,
    paymentMethod: check.method, items: sale.items,
  });
  const claimed = await repository.claimPending({
    businessId, saleId: sale.id, operationId, dteType: 39,
  });
  if (!claimed) return { state: 'already_claimed', operationId };

  let outcome;
  try {
    const response = await fetchImpl(`${sandboxBaseUrl.replace(/\/$/, '')}${SII_EMISSION_PATHS[39]}`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    const body = await response.json().catch(() => null);
    outcome = reconcileProviderOutcome({ statusCode: response.status, response: body });
    if (outcome.state === 'issued' && typeof body?.pdfBase64 === 'string') {
      outcome.pdfBase64 = body.pdfBase64;
    }
  } catch {
    outcome = reconcileProviderOutcome({ networkError: true });
  }
  // Unknown outcomes must be reconciled; never resend payment or fiscal request.
  await repository.finalize({ businessId, saleId: sale.id, operationId, ...outcome });
  return { state: outcome.state, folio: outcome.folio ?? null, operationId, reason: outcome.reason ?? null, existingFolio: outcome.existingFolio ?? null };
}
