// Evidencia para resolver un 'unknown' por reconciliación manual. Mismas reglas que
// public.crm_fiscal_reconcile_with_evidence (la BD vuelve a validar). Este módulo NO se expone
// en la API pública: solo lo usa lib/reconciler.mjs, que exige autorización explícita.

import { FiscalError } from './errors.mjs';
import { isStrictBase64, validDocument } from './document.mjs';

export function normalizeEvidence(evidence) {
  if (!evidence || typeof evidence !== 'object') throw new FiscalError('EVIDENCE_REQUIRED');
  const outcome = evidence.outcome;
  if (outcome !== 'issued' && outcome !== 'failed') throw new FiscalError('EVIDENCE_INVALID', 'outcome');

  const reviewer = String(evidence.reviewer ?? '').trim();
  const reason = String(evidence.reason ?? '').trim();
  const reference = String(evidence.evidenceReference ?? '').trim();
  if (reviewer.length < 3 || reason.length < 10 || reference.length < 3) {
    throw new FiscalError('EVIDENCE_REQUIRED', 'reviewer, reason and evidenceReference are required');
  }
  const checked = new Date(evidence.checkedAt);
  if (Number.isNaN(checked.getTime())) throw new FiscalError('EVIDENCE_REQUIRED', 'checkedAt');

  const base = { outcome, reviewer, reason, evidenceReference: reference, checkedAt: checked.toISOString() };
  if (outcome === 'issued') {
    if (evidence.providerStatus !== 'found') throw new FiscalError('EVIDENCE_INVALID', 'providerStatus must be found');
    if (!validDocument(evidence) || !isStrictBase64(evidence.xmlBase64) || !isStrictBase64(evidence.pdfBase64)) {
      throw new FiscalError('EVIDENCE_INCOMPLETE');
    }
    return { ...base, providerStatus: 'found', folio: evidence.folio, xmlBase64: evidence.xmlBase64, pdfBase64: evidence.pdfBase64 };
  }
  if (evidence.providerStatus !== 'not_found' || evidence.folio != null) {
    throw new FiscalError('EVIDENCE_INVALID', 'failed requires not_found and no folio');
  }
  return { ...base, providerStatus: 'not_found', folio: null, xmlBase64: null, pdfBase64: null };
}
