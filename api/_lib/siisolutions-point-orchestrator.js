import { issueCheckoutBoleta } from './siisolutions-checkout-issuer.js';

// Compatibility entry point. Uses the same sandbox-only fiscal worker as cash.
// A production provider URL is never accepted through this legacy API.
export async function issueVerifiedPointBoleta(options) {
  return issueCheckoutBoleta(options);
}
