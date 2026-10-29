/**
 * Offline configuration preflight. Never exposes, logs, or decrypts secrets.
 * No network requests, provider calls, or fiscal emission.
 */
export function inspectDteCoreReadiness(env = process.env) {
  const raw = env.SIISOLUTIONS_PILOT_ISSUERS_JSON;
  let records = null;
  let configIssue = null;
  if (typeof raw !== 'string' || !raw.trim()) {
    configIssue = 'MISSING_ISSUERS_JSON';
  } else {
    try {
      records = JSON.parse(raw);
      if (!records || typeof records !== 'object' || Array.isArray(records) ||
          Object.keys(records).length === 0) {
        configIssue = 'INVALID_ISSUERS_JSON';
      } else {
        for (const [id, record] of Object.entries(records)) {
          if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ||
              !record || typeof record !== 'object' || Array.isArray(record) ||
              record.verified !== true ||
              typeof record.operator_rut !== 'string' ||
              !/^\d{7,8}-[0-9Kk]$/.test(record.operator_rut) ||
              typeof record.api_key !== 'string' || !record.api_key.trim()) {
            configIssue = 'INVALID_ISSUER_RECORD';
            break;
          }
        }
      }
    } catch {
      configIssue = 'INVALID_ISSUERS_JSON';
    }
  }
  return {
    issuerCredentialsConfigured: configIssue === null,
    configIssue,
    simulationEnabled: env.SIISOLUTIONS_EMISSION_ENABLED === 'simulation',
    reconciliationEnabled: env.SIISOLUTIONS_RECONCILIATION_ENABLED === 'verified-readonly',
    liveEmissionEnabled: false,
    readyForLiveEmission: false,
    nextStep: configIssue === null
      ? 'Verify business authorization and provider response schema in a controlled environment'
      : 'Fix server-only SIISOLUTIONS_PILOT_ISSUERS_JSON; never use VITE_ variables',
  };
}
