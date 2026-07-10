/**
 * Determina si el catálogo público debe mostrar el botón "Ver más productos".
 *
 * visibleCount ya está acotado al límite del plan del negocio (ver
 * loadCatalog() en public-catalog/index.jsx, que llama setVisibleCount(maxProducts)
 * cuando el plan tiene un tope), así que basta comparar contra gridProducts.length:
 * no hace falta (ni es correcto) ocultar el botón solo porque el plan tenga un límite,
 * ya que eso puede dejar productos permitidos por el plan sin revelar (regresión
 * introducida en 7217cc3b).
 */
export function hasMoreCatalogProducts(gridProductsLength, visibleCount) {
  return gridProductsLength > visibleCount;
}
