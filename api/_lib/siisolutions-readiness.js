/**
 * Safe configuration preflight. Never returns, logs or decrypts API keys.
 * No network requests and no fiscal emission.
 */
export function inspectDteCoreReadiness(env = process.env) {
  const configured = typeof env.SIISOLUTIONS_PILOT_ISSUERS_JSON === 'string'
    && env.SIISOLUTIONS_PILOT_ISSUERS_JSON.trim().length > 0;
  const simulationEnabled = env.SIISOLUTIONS_EMISSION_ENABLED === 'simulation';
  const reconciliationEnabled = env.SIISOLUTIONS_RECONCILIATION_ENABLED === 'verified-readonly';
  return {
    issuerCredentialsConfigured: configured,
    simulationEnabled,
    reconciliationEnabled,
    liveEmissionEnabled: false,
    readyForLiveEmission: false,
    nextStep: configured
      ? 'Verify per-business issuer credentials and provider response schema in a controlled environment'
      : 'Configure server-only per-business DTECore credentials; do not use VITE_ variables',
  };
}
