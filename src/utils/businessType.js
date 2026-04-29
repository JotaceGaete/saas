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
 * Prioridad: 1) businessMode (columna explícita), 2) rubroSlug/rubroName legacy.
 */
export function isRestaurantBusiness(business) {
  // Fuente canónica: columna business_mode persistida por el dueño del negocio.
  if (business?.businessMode === 'restaurant') return true;

  // Fallback legacy: inferencia desde rubro (catálogos anteriores al campo business_mode).
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

