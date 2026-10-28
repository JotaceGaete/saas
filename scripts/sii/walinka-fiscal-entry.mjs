// SERVER ONLY — explicit identity boundary. Not an HTTP route; no SII emission.
// authClient must be a trusted Supabase Auth client configured on the server.
// Access token is verified with getUser(token), not decoded or trusted as a claim.
import { reserveAuthorizedBoleta39 } from './fiscal-authorization.mjs';
import { createWalinkaFiscalAdapter } from './walinka-fiscal-adapter.mjs';

export async function reserveWalinkaFiscalPilot({
  accessToken, businessId, saleId, authClient, db, issuerRegistry, taxMapping, reserve
}) {
  if (typeof accessToken !== 'string' || !accessToken.trim() ||
      typeof authClient?.auth?.getUser !== 'function') {
    throw Error('Verified Supabase session required');
  }
  const { data, error } = await authClient.auth.getUser(accessToken);
  if (error || !data?.user?.id || data.user.is_anonymous === true)
    throw Error('Fiscal authentication failed');
  const deps = createWalinkaFiscalAdapter({ db, issuerRegistry, taxMapping, reserve });
  return reserveAuthorizedBoleta39({
    actorId: data.user.id, businessId, saleId, deps
  });
}
