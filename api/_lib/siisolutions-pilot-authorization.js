/**
 * Server-only authorization source for the SII Solutions simulation pilot.
 *
 * Configure SIISOLUTIONS_PILOT_ISSUERS_JSON in the server runtime ONLY:
 * {"<business uuid>":{"operator_rut":"12345678-5","api_key":"sandbox-secret","verified":true}}
 * Never use VITE_ prefixes or expose this value to a browser.
 *
 * This loader does not authorize production issuance. Every business must be
 * explicitly listed and verified; no global fallback credentials are allowed.
 */
export function createFiscalPilotAuthorizationLoader({
  env = process.env,
} = {}) {
  return async function loadAuthorization({ businessId }) {
    if (typeof businessId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(businessId) ||
        env.SIISOLUTIONS_EMISSION_ENABLED !== 'simulation') return null;

    const raw = env.SIISOLUTIONS_PILOT_ISSUERS_JSON;
    if (typeof raw !== 'string' || !raw.trim()) return null;

    let issuers;
    try {
      issuers = JSON.parse(raw);
    } catch {
      return null;
    }
    if (!issuers || typeof issuers !== 'object' || Array.isArray(issuers) ||
        !Object.hasOwn(issuers, businessId)) return null;

    const record = issuers[businessId];
    if (!record || typeof record !== 'object' || Array.isArray(record) ||
        record.verified !== true || typeof record.operator_rut !== 'string' ||
        typeof record.api_key !== 'string') return null;

    return {
      business_id: businessId,
      provider: 'siisolutions',
      dte_type: 39,
      enabled: true,
      verified: true,
      operator_rut: record.operator_rut,
      api_key: record.api_key,
    };
  };
}
