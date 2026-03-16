function normalize(value) {
  return (value || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Detecta si el negocio pertenece al rubro restaurant.
 * Acepta distintas fuentes para no acoplarse a una sola columna.
 */
export function isRestaurantBusiness(business) {
  const candidates = [
    business?.category,
    business?.businessType,
    business?.rubro,
    business?.rubroSlug,
    business?.rubroName,
  ];
  const restaurantSlugs = ['restaurant', 'restaurante', 'gastronomia', 'comida'];
  return candidates.some((raw) => {
    const v = normalize(raw);
    return restaurantSlugs.includes(v);
  });
}

