// Internal DTE39 submission orchestration. No HTTP route; not enabled in Walinka UI.
// All caller inputs must be built from an authoritative, transactionally consistent DB snapshot.
// The atomic claim MUST check issuer, payment, tax verification and tenant authorization.
const { emitirBoleta } = require('./siiSolutionsBoleta.cjs');
const { recordProviderResult, recordUncertainResult } = require('./sii-fiscal-ledger-bridge.cjs');
async function submitPreparedBoleta({ db, operationId, payload, apiKey, beginSubmission, emit = emitirBoleta }) {
  if (typeof beginSubmission !== 'function' || !db?.rpc || !apiKey ||
      !payload?.idBoletaOperacion || !operationId) throw Error('FISCAL_SUBMISSION_NOT_CONFIGURED');
  // Claim first: if a previous call already claimed, NEVER call the provider again.
  const claim = await beginSubmission(operationId);
  if (!claim || claim.status !== 'submitting' || claim.operationId !== operationId ||
      claim.operationKey !== payload.idBoletaOperacion || claim.emissionAuthorized !== true)
    throw Error('FISCAL_CLAIM_NOT_AUTHORIZED');
  let result;
  try {
    result = await emit({ apiKey, payload });
  } catch (error) {
    // Even a validation error must be frozen unless independently reconciled.
    // The remote system may have processed the request before the failure.
    await recordUncertainResult({ db, operationId, reason: error?.code === 'PROVIDER_VALIDATION_REJECTED'
      ? 'PROVIDER_VALIDATION_REJECTED' : 'PROVIDER_OUTCOME_UNKNOWN' });
    return { status: 'unknown', reason: 'MANUAL_RECONCILIATION_REQUIRED' };
  }
  return recordProviderResult({ db, operationId, providerResult: result });
}
module.exports = { submitPreparedBoleta };
