import { assessBoletaEligibility } from './siisolutions-payment-eligibility.js';
import { issueVerifiedPointBoleta } from './siisolutions-point-orchestrator.js';

// This prepares both checkout methods but does not emit fiscal documents.
export function prepareFiscalSale({ sale, payment, businessId, issuerBusinessId }) {
  const eligibility = assessBoletaEligibility({ sale, payment, businessId, issuerBusinessId });
  if (!eligibility.eligible) return { ready: false, reason: eligibility.reason };
  return { ready: true, paymentMethod: eligibility.method, saleId: sale.id };
}

export { issueVerifiedPointBoleta };
