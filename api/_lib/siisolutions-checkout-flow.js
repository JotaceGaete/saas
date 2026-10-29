import { assessBoletaEligibility } from './siisolutions-payment-eligibility.js';
import { issueVerifiedPointBoleta } from './siisolutions-point-orchestrator.js';

// Cash flow is deliberately not sent through the Point-only orchestrator.
// A shared emission worker must be connected only after server-side cash
// receipt verification and the fiscal claim have been validated end to end.
export function prepareFiscalSale({ sale, payment, businessId, issuerBusinessId }) {
  const eligibility = assessBoletaEligibility({ sale, payment, businessId, issuerBusinessId });
  if (!eligibility.eligible) return { ready: false, reason: eligibility.reason };
  return { ready: true, paymentMethod: eligibility.method, saleId: sale.id };
}

export { issueVerifiedPointBoleta };
