// Pure fiscal issuance state machine. Used by the future server-side worker.
// A payment is NEVER repeated to recover a fiscal error.
export const FISCAL_STATES = Object.freeze({
  pending: 'pending',
  sending: 'sending',
  unknown: 'unknown',
  issued: 'issued',
  failed: 'failed',
  cancelled: 'cancelled',
});

const transitions = Object.freeze({
  pending: ['sending', 'cancelled'],
  sending: ['issued', 'unknown'],
  unknown: ['issued', 'failed'],
  issued: [],
  failed: [],
  cancelled: [],
});

export function nextFiscalState(current, next) {
  if (!Object.hasOwn(transitions, current) || !transitions[current].includes(next)) {
    throw new Error('Invalid fiscal state transition');
  }
  return next;
}

export function maySendToProvider(state) {
  // No automatic retry after a request may have reached the provider.
  return state === FISCAL_STATES.pending;
}

export function operationIdForSale(businessId, saleId) {
  if (!/^[0-9a-f-]{36}$/i.test(String(businessId)) || !/^[0-9a-f-]{36}$/i.test(String(saleId))) {
    throw new Error('Business and sale UUIDs required');
  }
  return `WLK-${businessId}-${saleId}`;
}

export function reconcileProviderOutcome({ statusCode, response, networkError }) {
  // Any network failure after sending may mean the document was emitted.
  if (networkError || !Number.isInteger(statusCode) || statusCode >= 500) {
    return { state: FISCAL_STATES.unknown, requiresManualReconciliation: true };
  }
  // The provider may return 409 for an already-issued operation. A folio
  // alone is NOT enough to mark it issued: retrieve and verify the original
  // XML/PDF via a separately authorized reconciliation flow first.
  if (statusCode === 409) {
    const existingFolio = response?.folioExistente;
    return {
      state: FISCAL_STATES.unknown,
      requiresManualReconciliation: true,
      reason: 'PROVIDER_OPERATION_ALREADY_EXISTS',
      ...(Number.isSafeInteger(existingFolio) && existingFolio > 0
        ? { existingFolio } : {}),
    };
  }
  if (statusCode >= 200 && statusCode < 300 &&
      Number.isSafeInteger(response?.folio) && response.folio > 0 &&
      typeof response?.xmlBase64 === 'string' && response.xmlBase64.length > 0 &&
      typeof response?.pdfBase64 === 'string' && response.pdfBase64.length > 0) {
    return { state: FISCAL_STATES.issued, folio: response.folio, xmlBase64: response.xmlBase64, pdfBase64: response.pdfBase64 };
  }
  if (statusCode >= 200 && statusCode < 300 && Number.isSafeInteger(response?.folio) && response.folio > 0) {
    return { state: FISCAL_STATES.unknown, folio: response.folio, requiresManualReconciliation: true, reason: 'FOLIO_ASSIGNED_DOCUMENTS_PENDING' };
  }
  // Even 4xx errors are not automatically retried without verifying provider behavior.
  return { state: FISCAL_STATES.unknown, requiresManualReconciliation: true };
}
