/**
 * Determina si el catálogo público debe mostrar el botón "Ver más productos".
 *
 * Deliberadamente agnóstico del plan del negocio y del precio de cada producto:
 * solo compara cuántos productos hay en la grilla filtrada/ordenada contra
 * cuántos están revelados. Any plan-based short-circuit here (p. ej. forzar
 * `false` cuando el plan tiene un tope de productos) es incorrecto — el límite
 * de plan ya se aplica en la consulta a Supabase (`getPublicProducts`) y no debe
 * duplicarse aquí, porque puede dejar productos permitidos por el plan sin
 * revelar (regresión introducida en 7217cc3b, corregida en 0ed9525, y
 * reintroducida al reconstruir la rama de producción — ver commit que agrega
 * este comentario).
 */
export function hasMoreCatalogProducts(gridProductsLength, visibleCount) {
  return gridProductsLength > visibleCount;
}
