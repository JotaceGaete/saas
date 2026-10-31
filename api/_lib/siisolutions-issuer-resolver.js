/**
 * Server-only fiscal issuer resolver.
 *
 * loadAuthorization must query a protected source by businessId. It must not
 * return credentials from user-controlled metadata or request bodies.
 * Credentials are never included in errors or logs.
 */
export function createBusinessFiscalIssuerResolver({ loadAuthorization }) {
  if (typeof loadAuthorization !== 'function') {
    throw new Error('Trusted fiscal authorization loader required');
  }
  return async function resolveIssuer({ businessId }) {
    if (!businessId) return null;
    const authorization = await loadAuthorization({ businessId });
    if (!authorization ||
        authorization.business_id !== businessId ||
        authorization.provider !== 'siisolutions' ||
        authorization.dte_type !== 39 ||
        authorization.enabled !== true ||
        authorization.verified !== true ||
        typeof authorization.operator_rut !== 'string' ||
        !/^\d{7,8}-[0-9Kk]$/.test(authorization.operator_rut) ||
        typeof authorization.api_key !== 'string' ||
        !authorization.api_key.trim()) {
      return null;
    }
    return {
      businessId,
      authorized: true,
      operatorRut: authorization.operator_rut,
      apiKey: authorization.api_key,
    };
  };
}
