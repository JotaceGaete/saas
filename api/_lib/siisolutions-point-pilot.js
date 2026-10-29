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
 * resolveIssuer must load and authorize credentials for the EXACT business
 * being issued; a global API key/operator RUT is unsafe for multi-tenancy.
 *
 * No HTTP route, cron or Point webhook calls this function yet.
 * Emission remains subject to the simulation-only gate in the issuer.
 */
export function createPointFiscalPilot({
  admin, resolveIssuer, sandboxBaseUrl, fetchImpl = fetch,
}) {
  if (!admin?.from || !admin?.rpc) throw new Error('Trusted admin client required');
  if (typeof resolveIssuer !== 'function') throw new Error('Business-scoped fiscal issuer resolver required');
  const loadPersisted = createPointFiscalSaleLoader(admin);
  const loadConnection = createFiscalPointConnectionLoader(admin);
  const fetchProviderOrder = createFiscalPointOrderFetcher({ loadConnection, fetchImpl });
  const repository = createFiscalIssuanceRepository(admin);

  return async function issuePointSale({ businessId, invoiceId }) {
    if (!businessId || !invoiceId) return { state: 'blocked', reason: 'SALE_IDENTITY_REQUIRED' };
    const issuer = await resolveIssuer({ businessId });
    if (!issuer || issuer.businessId !== businessId || issuer.authorized !== true ||
        !issuer.operatorRut || !issuer.apiKey) {
      return { state: 'blocked', reason: 'ISSUER_NOT_AUTHORIZED' };
    }
    return issueVerifiedPointBoleta({
      businessId, invoiceId, issuerBusinessId: issuer.businessId,
      loadPersisted, fetchProviderOrder, repository,
      operatorRut: issuer.operatorRut, apiKey: issuer.apiKey,
      sandboxBaseUrl, fetchImpl,
    });
  };
}
