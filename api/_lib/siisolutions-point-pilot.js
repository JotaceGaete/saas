import { createPointFiscalSaleLoader } from './siisolutions-point-sale-loader.js';
import {
  createFiscalPointConnectionLoader,
  createFiscalPointOrderFetcher,
} from './siisolutions-point-provider.js';
import { createFiscalIssuanceRepository } from './siisolutions-repository.js';
import { issueVerifiedPointBoleta } from './siisolutions-point-checkout.js';

/**
 * Trusted server composition root for a Point DTE 39 pilot.
 * admin must be a server-created Supabase service-role client.
 * operatorRut and provider credentials must come from server config.
 *
 * No HTTP route, cron or Point webhook calls this function yet.
 * Emission remains subject to the simulation-only gate in the issuer.
 */
export function createPointFiscalPilot({
  admin, operatorRut, apiKey, sandboxBaseUrl, fetchImpl = fetch,
}) {
  if (!admin?.from || !admin?.rpc) throw new Error('Trusted admin client required');
  const loadPersisted = createPointFiscalSaleLoader(admin);
  const loadConnection = createFiscalPointConnectionLoader(admin);
  const fetchProviderOrder = createFiscalPointOrderFetcher({ loadConnection, fetchImpl });
  const repository = createFiscalIssuanceRepository(admin);

  return async function issuePointSale({ businessId, invoiceId }) {
    if (!businessId || !invoiceId) return { state: 'blocked', reason: 'SALE_IDENTITY_REQUIRED' };
    return issueVerifiedPointBoleta({
      businessId, invoiceId, issuerBusinessId: businessId,
      loadPersisted, fetchProviderOrder, repository,
      operatorRut, apiKey, sandboxBaseUrl, fetchImpl,
    });
  };
}
