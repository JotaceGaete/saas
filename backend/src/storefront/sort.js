/** Orden de listados (Storefront v1.2 §5). Desempate por id en todos los modos. */
const nameCollator = new Intl.Collator('es', { sensitivity: 'base' });

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

export function compareKeys(sort, a, b) {
  if (sort === 'name_asc') return nameCollator.compare(String(a), String(b));
  const d = Number(a) - Number(b);
  return sort === 'price_desc' ? -d : d;
}

export function compareProducts(sort) {
  return (a, b) => {
    const d = compareKeys(sort, sortKeyOf(sort, a), sortKeyOf(sort, b));
    if (d !== 0) return d;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
}

/** true si p viene estrictamente después de la posición (key, id). */
export function isAfterPosition(sort, p, key, id) {
  const d = compareKeys(sort, sortKeyOf(sort, p), key);
  if (d !== 0) return d > 0;
  return p.id > id;
}
