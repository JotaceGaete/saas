export const BUSINESS_MODES = {
  STORE: 'store',
  RESTAURANT: 'restaurant',
};

export const isRestaurantBusiness = (business) =>
  business?.businessMode === BUSINESS_MODES.RESTAURANT;

export const isStoreBusiness = (business) =>
  !business?.businessMode || business?.businessMode === BUSINESS_MODES.STORE;

const GASTRO_KEYWORDS = [
  'gastronomia', 'gastronomía',
  'comida', 'comida-rapida', 'comida rapida',
  'restaurant', 'restaurante', 'restauración',
  'cafeteria', 'cafetería', 'cafe', 'café',
  'delivery',
  'bar',
  'pizzeria', 'pizzería',
  'hamburguesas', 'hamburgueseria', 'hamburguesería',
  'sushi',
  'panaderia', 'panadería',
  'pasteleria', 'pastelería',
  'heladeria', 'heladería',
  'cerveceria', 'cervecería',
  'food',
];

/**
 * Returns 'restaurant' if the rubro name or slug looks gastronomic,
 * 'store' otherwise. Works with either field; does not throw on nulls.
 */
export const getRecommendedBusinessModeFromRubro = (rubro) => {
  if (!rubro) return BUSINESS_MODES.STORE;
  const haystack = [rubro?.name, rubro?.slug]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

  const normalizedKeywords = GASTRO_KEYWORDS.map((k) =>
    k.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''),
  );

  return normalizedKeywords.some((k) => haystack.includes(k))
    ? BUSINESS_MODES.RESTAURANT
    : BUSINESS_MODES.STORE;
};
