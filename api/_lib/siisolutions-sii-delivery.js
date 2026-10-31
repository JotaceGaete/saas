/**
 * Read-only classification of DTE Core's asynchronous SII delivery status.
 * This function never emits a document or authorizes a retry.
 */
export function classifyDteCoreDelivery({ folio, trackId, deliveryCode, errorCode, message } = {}) {
  if (!Number.isSafeInteger(folio) || folio <= 0) {
    return { state: 'unknown', reason: 'MISSING_FOLIO', retryIssuance: false };
  }
  const evidence = {
    folio,
    trackId: typeof trackId === 'string' && trackId.trim() ? trackId.trim() : null,
  };
  if (String(deliveryCode) === '-11' || String(errorCode) === '2') {
    return {
      ...evidence,
      state: 'requires_review',
      reason: 'SII_PROCESSING_ERROR',
      detail: typeof message === 'string' ? message.slice(0, 200) : null,
      retryIssuance: false,
    };
  }
  // Submission and track IDs are not proof of SII acceptance.
  return { ...evidence, state: 'unverified', reason: 'ACCEPTANCE_NOT_CONFIRMED', retryIssuance: false };
}
