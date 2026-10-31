// Identificadores de proveedor fiscal. Única fuente para la API y el emisor.
//
// CANONICAL: identificador interno de DTECore. Se escribe en emisores (fiscal.issuers), credenciales
// (fiscal.business_credentials) y emisiones nuevas (public.crm_fiscal_issuances).
//
// LEGACY: valores del piloto ya guardados. NO se reescriben ni se convierten en CANONICAL:
//   'siisolutions'  -> ledger del piloto.
//   'sii_solutions' -> emisor del piloto.
// Las funciones de recuperación y lectura de documentos aceptan ambos, así el histórico sigue vivo.

export const CANONICAL_PROVIDER = 'dtecore';

export const LEDGER_PROVIDER_IDS = Object.freeze(['siisolutions', CANONICAL_PROVIDER]);
export const ISSUER_PROVIDER_IDS = Object.freeze(['sii_solutions', CANONICAL_PROVIDER]);

// Valor que se escribe en el ledger para un emisor, o null si el proveedor no es reconocido.
// Espejo de fiscal.ledger_provider() en SQL (20261102_fiscal_provider_claim_guard.sql).
export function ledgerProviderFor(issuerProvider) {
  if (issuerProvider === CANONICAL_PROVIDER) return CANONICAL_PROVIDER;
  if (issuerProvider === 'sii_solutions') return 'siisolutions';
  return null;
}
