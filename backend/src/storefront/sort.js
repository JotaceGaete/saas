/**
 * Modos de orden de listados (Storefront v1.2 §5). El orden real lo aplica PostgreSQL
 * (storefront_list_products); aquí solo se extrae la clave de posición para el cursor.
 * Desempate siempre por id ascendente.
 */
export const SORT_MODES = Object.freeze(['manual', 'price_asc', 'price_desc', 'name_asc']);

export function sortKeyOf(sort, p) {
  switch (sort) {
    case 'manual': return p.sortOrder;
    case 'price_asc':
    case 'price_desc': return p.price;
    case 'name_asc': return p.name;
    default: throw new Error(`sort no soportado: ${sort}`);
  }
}
