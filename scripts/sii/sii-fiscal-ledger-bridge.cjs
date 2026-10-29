// Server-only bridge from SII Solutions adapter to private fiscal ledger.
// Not an HTTP endpoint. The caller must have already performed the atomic
// pending->submitting claim and authenticated the tenant. No provider calls here.
const { classifyProviderResponse } = require('./sii-provider-reconciliation.cjs');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Correct UUID validator: operation IDs come from the database, never from a provider payload.
const OPERATION_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function recordProviderResult({ db, operationId, providerResult }) {
  if (!db || typeof db.rpc !== 'function' || !OPERATION_UUID.test(operationId || ''))
    throw new Error('Trusted fiscal ledger and operation ID required');
  const classified = classifyProviderResponse(providerResult);
  const { data, error } = await db.rpc('sii_pilot_record_provider_result', {
    p_operation_id: operationId,
    p_result: classified.status,
    p_folio: classified.folio ?? null,
    p_provider_response_id: null,
    p_error_code: classified.reason
  });
  if (error || !data || data.operationId !== operationId)
    throw new Error('FISCAL_LEDGER_RECORD_FAILED: manual reconciliation required; do not retry emission');
  return { ...classified, ledger: data };
}
// Ambiguous provider/network outcomes must be durably frozen as unknown.
// This helper never retries or resends a DTE.
async function recordUncertainResult({ db, operationId, reason = 'PROVIDER_NETWORK_UNKNOWN' }) {
  if (!db || typeof db.rpc !== 'function' || !OPERATION_UUID.test(operationId || ''))
    throw new Error('Trusted fiscal ledger and operation ID required');
  const { data, error } = await db.rpc('sii_pilot_record_provider_result', {
    p_operation_id: operationId, p_result: 'unknown',
    p_folio: null, p_provider_response_id: null, p_error_code: String(reason).slice(0,120)
  });
  if (error || !data || data.operationId !== operationId)
    throw new Error('FISCAL_LEDGER_UNCERTAIN_RECORD_FAILED: manual reconciliation required');
  return data;
}
module.exports = { recordProviderResult, recordUncertainResult };
