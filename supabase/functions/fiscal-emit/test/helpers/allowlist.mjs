// SOLO PRUEBAS. Lista que autoriza cualquier negocio, para las pruebas que no tratan sobre la lista
// de empresas autorizadas (esas usan parseAllowedIssuers con UUID y RUT reales). El código de
// producción no tiene ningún modo "permitir a todos": lib/allowlist.mjs falla cerrado.
export const TEST_ALLOW_ALL = Object.freeze({
  error: null,
  size: Infinity,
  permitsBusiness: () => true,
  permits: () => true,
});
