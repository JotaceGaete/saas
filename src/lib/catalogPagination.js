/**
 * Determina si el catálogo público debe mostrar el botón "Ver más productos".
 *
 * Deliberadamente agnóstico del plan del negocio: solo compara cuántos
 * productos hay en la grilla filtrada/ordenada (gridProducts) contra cuántos
 * están revelados (visibleCount). Cualquier cortocircuito basado en el plan
 * (p. ej. forzar `false` cuando el plan tiene un tope de productos) es
 * incorrecto — el tope de plan ya se aplica en la consulta a Supabase
 * (getPublicProducts, vía el parámetro maxProducts) y no debe duplicarse
 * aquí, porque puede dejar productos ya cargados (y permitidos por el plan)
 * sin revelar.
 *
 * Regresión: introducida en 7217cc3, corregida en 0ed9525 y 2083b89 (ninguna
 * de las dos llegó nunca a main), reintroducida al reconstruir la rama de
 * producción.
 *
 * Contrato funcional permanente: todo producto publicado y permitido por el
 * plan debe poder verse en el catálogo público. Ningún rediseño, filtro,
 * optimización o cambio de layout puede dejar productos inaccesibles por
 * ocultar la paginación o el botón "Ver más".
 */
export function hasMoreCatalogProducts(gridProductsLength, visibleCount) {
  return gridProductsLength > visibleCount;
}
