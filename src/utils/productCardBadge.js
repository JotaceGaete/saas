/**
 * Un solo badge de confianza por producto (catálogo público).
 * Prioridad: Oferta > Más vendido > Nuevo > Disponible
 *
 * «Nuevo»: created_at hace menos de 14 días, sin oferta ni destacado (coherente con prioridad superior).
 */

const NEW_PRODUCT_DAYS = 14;

function isRecent(createdAt) {
  if (!createdAt) return false;
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < NEW_PRODUCT_DAYS * 86400000;
}

/**
 * @param {object} product
 * @returns {{ key: string, label: string, style: { backgroundColor: string, color: string } } | null}
 */
export function getProductCardTrustBadge(product) {
  if (!product) return null;
  if (product.onSale === true) {
    return { key: 'offer', label: 'Oferta', style: { backgroundColor: '#dc2626', color: '#ffffff' } };
  }
  if (product.featured === true) {
    return { key: 'bestseller', label: 'Más vendido', style: { backgroundColor: '#b45309', color: '#ffffff' } };
  }
  if (product.onSale !== true && product.featured !== true && isRecent(product.createdAt)) {
    return { key: 'new', label: 'Nuevo', style: { backgroundColor: '#2563eb', color: '#ffffff' } };
  }
  if (product.isActive !== false) {
    return { key: 'available', label: 'Disponible', style: { backgroundColor: '#15803d', color: '#ffffff' } };
  }
  return null;
}
