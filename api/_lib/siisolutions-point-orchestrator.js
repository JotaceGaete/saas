import { buildBoletaPayload, SII_BASE_URL, SII_EMISSION_PATHS } from './siisolutions-adapter.js';
import { assessPointBoletaEligibility } from './siisolutions-sale-eligibility.js';
import { operationIdForSale, reconcileProviderOutcome } from './siisolutions-issuance-state.js';

/**
 * Server-only orchestration. Must be invoked after a trusted Mercado Pago
 * server-to-server verification. No browser or client-originated payment flags.
 *
 * The repository contract must implement atomic claimPending() using a DB
 * transaction/unique constraints; false means another worker already claimed.
 * The caller must have already verified the provider's SIMULATION environment.
 */
export async function issueVerifiedPointBoleta({
  sale, payment, businessId, issuerBusinessId, operatorRut,
  apiKey, repository, fetchImpl = fetch, simulationVerified = false,
}) {
  const eligibility = assessPointBoletaEligibility({ sale, payment, businessId, issuerBusinessId });
  if (!eligibility.eligible) return { state: 'blocked', reason: eligibility.reason };
  if (process.env.SIISOLUTIONS_EMISSION_ENABLED !== 'simulation' || simulationVerified !== true) {
    return { state: 'blocked', reason: 'SIMULATION_NOT_VERIFIED' };
  }
  if (!apiKey || !repository?.claimPending || !repository?.finalize) {
    throw new Error('Server configuration or atomic repository missing');
  }

  const operationId = operationIdForSale(businessId, sale.id);
  const payload = buildBoletaPayload({
    id: operationId, operatorRut, total: sale.total,
    paymentMethod: 'mercado_pago', items: sale.items,
  });
  const claimed = await repository.claimPending({
    businessId, saleId: sale.id, operationId, dteType: 39,
  });
  if (!claimed) return { state: 'already_claimed', operationId };

  let outcome;
  try {
    const response = await fetchImpl(`${SII_BASE_URL}${SII_EMISSION_PATHS[39]}`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    const body = await response.json().catch(() => null);
    outcome = reconcileProviderOutcome({ statusCode: response.status, response: body });
  } catch {
    outcome = reconcileProviderOutcome({ networkError: true });
  }
  // If finalize fails, do NOT re-send: the provider may already have issued.
  await repository.finalize({ businessId, saleId: sale.id, operationId, ...outcome });
  return { state: outcome.state, folio: outcome.folio ?? null, operationId };
}
