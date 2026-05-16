/**
 * Un solo badge de confianza por producto (catálogo público).
 * Prioridad: Oferta (con % OFF) > Oferta (sin %) > Más vendido > Nuevo > Disponible
 *
 * «Nuevo»: created_at hace menos de 14 días, sin oferta ni destacado.
 */

import { getDiscountPercent } from './offerHelpers';

const NEW_PRODUCT_DAYS = 14;

function isRecent(createdAt) {
  if (!createdAt) return false;
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < NEW_PRODUCT_DAYS * 86400000;
}

/**
 * @param {object} product
 * @returns {{ key: string, label: string, style: object, discount: number|null } | null}
 *   `discount` — porcentaje entero si hay descuento real, null en caso contrario.
 */
export function getProductCardTrustBadge(product) {
  if (!product) return null;
  if (product.onSale === true) {
    const discount = getDiscountPercent(product.price, product.compareAtPrice);
    if (discount !== null) {
      // Descuento real: badge rojo con porcentaje
      return {
        key: 'offer-pct',
        label: `-${discount}% OFF`,
        style: { backgroundColor: '#dc2626', color: '#ffffff' },
        discount,
      };
    }
    // En oferta pero sin precio anterior válido: badge ámbar más sutil
    return {
      key: 'offer',
      label: 'Oferta',
      style: { backgroundColor: '#D97706', color: '#ffffff' },
      discount: null,
    };
  }
  if (product.featured === true) {
    return { key: 'bestseller', label: 'Más vendido', style: { backgroundColor: '#b45309', color: '#ffffff' }, discount: null };
  }
  if (product.onSale !== true && product.featured !== true && isRecent(product.createdAt)) {
    return { key: 'new', label: 'Nuevo', style: { backgroundColor: '#2563eb', color: '#ffffff' }, discount: null };
  }
  return null;
}
