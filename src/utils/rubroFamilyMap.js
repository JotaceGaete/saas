/**
 * Mapa wa_rubros.slug → familia comercial.
 *
 * Usado por la resolución jerárquica de plantillas de catálogo:
 *   rubro_slug exacto → family_slug → universal → JS fallback
 *
 * Familias válidas: moda, comida, belleza, servicios, hogar,
 *                   mascotas, tecnologia, salud, regalos
 */
export const RUBRO_FAMILY_MAP = Object.freeze({
  // Moda
  'ropa':                          'moda',
  'moda-y-accesorios':             'moda',
  'accesorio-de-moda':             'moda',
  'zapateria':                     'moda',

  // Comida
  'gastronomia':                   'comida',
  'comida':                        'comida',
  'comida-y-bebidas':              'comida',
  'panaderia-y-pasteleria':        'comida',

  // Belleza
  'belleza':                       'belleza',
  'belleza-y-cuidado-personal':    'belleza',

  // Servicios
  'servicios':                     'servicios',
  'papeleria':                     'servicios',
  'repuestos-automotrices':        'servicios',

  // Hogar
  'hogar-y-decoracion':            'hogar',
  'hogar':                         'hogar',
  'ferreteria':                    'hogar',
  'vivero':                        'hogar',

  // Mascotas
  'mascotas':                      'mascotas',

  // Tecnología
  'tecnologia-y-electronica':      'tecnologia',
  'electronica':                   'tecnologia',

  // Salud
  'salud':                         'salud',
  'bienestar-y-deporte':           'salud',

  // Regalos
  'floreria':                      'regalos',
  'regalos':                       'regalos',
  'packaging-envases-y-embalajes': 'regalos',
  'productos-personalizados':      'regalos',
  'ninos':                         'regalos',
});

/** Familias disponibles en el orden para mostrar en el admin. */
export const FAMILIES = Object.freeze([
  { slug: 'moda',       label: 'Moda' },
  { slug: 'comida',     label: 'Comida y gastronomía' },
  { slug: 'belleza',    label: 'Belleza' },
  { slug: 'servicios',  label: 'Servicios' },
  { slug: 'hogar',      label: 'Hogar' },
  { slug: 'mascotas',   label: 'Mascotas' },
  { slug: 'tecnologia', label: 'Tecnología' },
  { slug: 'salud',      label: 'Salud y bienestar' },
  { slug: 'regalos',    label: 'Regalos y personalizados' },
]);

/**
 * Devuelve la familia comercial de un rubro, o null si no está mapeado.
 * @param {string} rubroSlug
 * @returns {string|null}
 */
export function getFamilyForRubro(rubroSlug) {
  return RUBRO_FAMILY_MAP[String(rubroSlug || '').trim().toLowerCase()] ?? null;
}
