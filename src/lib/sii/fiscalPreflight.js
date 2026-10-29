// Fiscal preflight: strict guards BEFORE any CAF allocation, signature or SII submission.
// This module deliberately does not emit a valid SII DTE.
import { normalizeChileanRut, SII_DOCUMENT_TYPES } from './fiscalDraft';

export const SII_ENVIRONMENTS = Object.freeze(['certification', 'production']);

export function validateFiscalConfiguration(config) {
  if (!config || typeof config !== 'object') throw new Error('Configuración tributaria ausente');
  const issuerRut = normalizeChileanRut(config.issuerRut);
  if (!config.businessId || typeof config.businessId !== 'string') throw new Error('Negocio inválido');
  if (!SII_ENVIRONMENTS.includes(config.environment)) throw new Error('Ambiente SII inválido');
  if (config.countryCode !== 'CL') throw new Error('Solo se admite Chile');
  if (!config.certifiedDocumentTypes?.includes(SII_DOCUMENT_TYPES.BOLETA_AFECTA)) {
    throw new Error('Boleta 39 no habilitada para este contribuyente');
  }
  if (config.environment === 'production' && config.productionEnabled !== true) {
    throw new Error('Emisión productiva bloqueada');
  }
  // Never accept raw certificates, CAF XML or private keys in browser-supplied config.
  for (const forbidden of ['certificate', 'privateKey', 'cafXml', 'certificatePassword']) {
    if (Object.hasOwn(config, forbidden)) throw new Error('Material criptográfico prohibido en la solicitud');
  }
  return { businessId: config.businessId, issuerRut, environment: config.environment };
}

export function validateFiscalSale(draft, config) {
  const checked = validateFiscalConfiguration(config);
  if (!draft || draft.status !== 'draft_only' || draft.documentType !== 39) throw new Error('Borrador tributario inválido');
  if (draft.businessId !== checked.businessId || normalizeChileanRut(draft.issuerRut) !== checked.issuerRut) {
    throw new Error('Venta y contribuyente no coinciden');
  }
  if (draft.currency !== 'CLP' || !Number.isSafeInteger(draft.total) || draft.total <= 0) throw new Error('Monto inválido');
  if (typeof draft.idempotencyKey !== 'string' || draft.idempotencyKey !== `CL:${checked.businessId}:${draft.saleId}:39`) {
    throw new Error('Clave de idempotencia inválida');
  }
  return { ...checked, saleId: draft.saleId, documentType: 39, total: draft.total, idempotencyKey: draft.idempotencyKey };
}

export function assertReadyForSubmission({ configuration, draft, folio, signedXml, schemaValidated, cafVerified, authorizedSigner, siiToken }) {
  const preflight = validateFiscalSale(draft, configuration);
  if (!Number.isSafeInteger(folio) || folio <= 0) throw new Error('Folio SII inválido');
  if (!schemaValidated || !cafVerified || !authorizedSigner) throw new Error('Faltan verificaciones fiscales obligatorias');
  if (typeof signedXml !== 'string' || !signedXml.trim()) throw new Error('XML firmado ausente');
  if (typeof siiToken !== 'string' || !siiToken.trim()) throw new Error('Autenticación SII ausente');
  // Defense in depth: the actual transport MUST independently verify signed XML, CAF and authorization.
  return { ...preflight, folio };
}
