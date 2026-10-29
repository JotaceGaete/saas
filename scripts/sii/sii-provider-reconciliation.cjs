// Conservative DTE39 provider response classification.
// A provider acknowledgement is not equivalent to SII tax acceptance.
// Never retry a submitted or uncertain operation automatically.
function classifyProviderResponse(result) {
  if (!result || typeof result !== 'object') return { status: 'unknown', reason: 'NO_PROVIDER_RESPONSE' };
  const payload = result.response && typeof result.response === 'object' ? result.response : result;
  const folio = Number(payload.folio ?? payload.folioExistente ?? result.folio);
  const safeFolio = Number.isSafeInteger(folio) && folio > 0 ? folio : null;
  if (result.status === 'already_issued') {
    return safeFolio ? { status: 'unknown', folio: safeFolio, reason: 'EXISTING_FOLIO_REQUIRES_RECONCILIATION' }
      : { status: 'unknown', reason: 'CONFLICT_WITHOUT_FOLIO' };
  }
  if (result.status !== 'submitted' || payload.success !== true)
    return { status: 'unknown', reason: 'AMBIGUOUS_PROVIDER_RESULT' };
  // Successful provider submission only means it reached the provider, not that SII accepted it.
  return { status: 'submitted', folio: safeFolio, reason: 'SII_ACCEPTANCE_NOT_CONFIRMED' };
}
module.exports = { classifyProviderResponse };
