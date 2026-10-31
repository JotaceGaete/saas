import { createPointFiscalSaleLoader } from './siisolutions-point-sale-loader.js';
import {
  createFiscalPointConnectionLoader,
  createFiscalPointOrderFetcher,
} from './siisolutions-point-provider.js';
import { createFiscalIssuanceRepository } from './siisolutions-repository.js';
import { issueVerifiedPointBoleta } from './siisolutions-point-checkout.js';
import { createBusinessFiscalIssuerResolver } from './siisolutions-issuer-resolver.js';
import { createFiscalPilotAuthorizationLoader } from './siisolutions-pilot-authorization.js';
import { inspectDteCoreReadiness } from './siisolutions-readiness.js';

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

/**
 * Default simulation-only assembly. It reads business-scoped credentials from
 * protected server environment and never falls back to a global issuer.
 * No HTTP route or background worker is registered by this helper.
 */
export function createConfiguredPointFiscalPilot({ admin, sandboxBaseUrl, fetchImpl = fetch, env = process.env }) {
  const loadAuthorization = createFiscalPilotAuthorizationLoader({ env });
  const resolveIssuer = createBusinessFiscalIssuerResolver({ loadAuthorization });
  const issuePointSale = createPointFiscalPilot({ admin, resolveIssuer, sandboxBaseUrl, fetchImpl });
  return async function issueConfiguredPointSale(args) {
    const readiness = inspectDteCoreReadiness(env);
    if (!readiness.issuerCredentialsConfigured) {
      return { state: 'blocked', reason: readiness.configIssue };
    }
    if (!readiness.simulationEnabled && env.SIISOLUTIONS_EMISSION_ENABLED !== 'live') {
      return { state: 'blocked', reason: 'FISCAL_EMISSION_NOT_ENABLED' };
    }
    // Configuration failures are rejected before loading sales or contacting
    // Mercado Pago/DTECore. This wrapper never enables production emission.
    return issuePointSale(args);
  };
}
