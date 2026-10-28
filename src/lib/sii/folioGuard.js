// Deterministic folio guard for server-side SII issuance.
// CAF signature verification and atomic allocation are separate mandatory steps.
// Do not expose CAF contents or private keys to the browser.
import { normalizeChileanRut } from './fiscalDraft';

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label}: entero positivo requerido`);
  return value;
}

/**
 * Checks a folio against *already verified* CAF metadata.
 * Never trust metadata supplied by the browser. Verify the CAF signature and
 * issuer against SII-issued material on the server before calling this function.
 */
export function validateFolioAgainstCaf({ caf, issuerRut, documentType, folio, issueDate }) {
  if (!caf || typeof caf !== 'object') throw new Error('CAF ausente');
  const issuer = normalizeChileanRut(issuerRut);
  const cafIssuer = normalizeChileanRut(caf.issuerRut);
  if (issuer !== cafIssuer) throw new Error('CAF pertenece a otro contribuyente');
  if (documentType !== 39 || caf.documentType !== documentType) throw new Error('Tipo de documento no autorizado por CAF');
  const start = positiveInteger(caf.rangeStart, 'Inicio CAF');
  const end = positiveInteger(caf.rangeEnd, 'Fin CAF');
  const number = positiveInteger(folio, 'Folio');
  if (start > end || number < start || number > end) throw new Error('Folio fuera de rango CAF');
  if (caf.cryptographicallyVerified !== true) throw new Error('CAF sin verificación criptográfica');
  if (caf.revoked === true) throw new Error('CAF revocado');
  if (typeof issueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) throw new Error('Fecha de emisión inválida');
  const date = new Date(issueDate + 'T00:00:00Z');
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== issueDate) throw new Error('Fecha de emisión inválida');
  if (typeof caf.authorizedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(caf.authorizedAt) || issueDate < caf.authorizedAt) {
    throw new Error('Fecha anterior a autorización CAF');
  }
  return Object.freeze({ issuerRut: issuer, documentType, folio: number, rangeStart: start, rangeEnd: end });
}

/**
 * Reservation must be atomic and durable: a unique DB constraint on
 * (issuer_rut, document_type, folio) and (business_id, sale_id, document_type).
 * Do not automatically retry a submission with a new folio when SII status
 * is unknown: reconcile using track ID / folio before any resubmission.
 */
export const FOLIO_RESERVATION_STATES = Object.freeze([
  'reserved', 'signed', 'submitted', 'accepted', 'rejected', 'unknown'
]);
