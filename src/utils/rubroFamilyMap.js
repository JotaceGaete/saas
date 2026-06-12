/**
 * Mapa wa_rubros.slug → familia de plantilla de catálogo.
 *
 * La resolución de onboarding sigue 3 niveles:
 *   1. Rubro exacto (catalog_templates.rubro_slug)
 *   2. Familia      (catalog_templates.family_slug, sin rubro_slug)
 *   3. Universal    (family_slug = 'universal', sin rubro_slug)
 *
 * Familias disponibles: moda, comida, belleza, servicios, hogar,
 * mascotas, tecnologia, salud, automotriz, regalos, universal.
 *
 * Para añadir un rubro: agrega la entrada en RUBRO_FAMILY_MAP.
 * Para añadir una familia: agrega la entrada en TEMPLATE_FAMILY_LABELS
 * y crea un template con esa family_slug en /admin/catalog-templates.
 */

export const TEMPLATE_FAMILIES = [
  'moda',
  'comida',
  'belleza',
  'servicios',
  'hogar',
  'mascotas',
  'tecnologia',
  'salud',
  'automotriz',
  'regalos',
  'universal',
];

export const TEMPLATE_FAMILY_LABELS = {
  moda: 'Moda y accesorios',
  comida: 'Comida y bebidas',
  belleza: 'Belleza y cuidado personal',
  servicios: 'Servicios',
  hogar: 'Hogar y decoración',
  mascotas: 'Mascotas',
  tecnologia: 'Tecnología',
  salud: 'Salud y bienestar',
  automotriz: 'Automotriz',
  regalos: 'Regalos y flores',
  universal: 'Universal (fallback general)',
};

export const RUBRO_FAMILY_MAP = {
  // moda
  ropa: 'moda',
  'moda-y-accesorios': 'moda',
  calzado: 'moda',
  accesorios: 'moda',
  joyeria: 'moda',
  lenceria: 'moda',
  bolsos: 'moda',
  // comida
  'comida-y-bebidas': 'comida',
  gastronomia: 'comida',
  restaurante: 'comida',
  cafeteria: 'comida',
  pasteleria: 'comida',
  panaderia: 'comida',
  heladeria: 'comida',
  bar: 'comida',
  delivery: 'comida',
  catering: 'comida',
  // belleza
  peluqueria: 'belleza',
  barberia: 'belleza',
  unas: 'belleza',
  estetica: 'belleza',
  spa: 'belleza',
  cosmetica: 'belleza',
  maquillaje: 'belleza',
  tatuajes: 'belleza',
  // servicios
  servicios: 'servicios',
  limpieza: 'servicios',
  plomeria: 'servicios',
  electricidad: 'servicios',
  carpinteria: 'servicios',
  jardineria: 'servicios',
  fotografia: 'servicios',
  'diseno': 'servicios',
  consultoria: 'servicios',
  educacion: 'servicios',
  clases: 'servicios',
  abogados: 'servicios',
  contabilidad: 'servicios',
  // hogar
  hogar: 'hogar',
  muebles: 'hogar',
  decoracion: 'hogar',
  ferreteria: 'hogar',
  electrodomesticos: 'hogar',
  pintura: 'hogar',
  // mascotas
  mascotas: 'mascotas',
  veterinaria: 'mascotas',
  grooming: 'mascotas',
  'accesorios-mascotas': 'mascotas',
  // tecnologia
  tecnologia: 'tecnologia',
  electronica: 'tecnologia',
  computacion: 'tecnologia',
  celulares: 'tecnologia',
  videojuegos: 'tecnologia',
  'accesorios-tecnologia': 'tecnologia',
  // salud
  salud: 'salud',
  farmacia: 'salud',
  optica: 'salud',
  nutricion: 'salud',
  suplementos: 'salud',
  deporte: 'salud',
  fitness: 'salud',
  psicologia: 'salud',
  // automotriz
  automotriz: 'automotriz',
  repuestos: 'automotriz',
  taller: 'automotriz',
  'accesorios-auto': 'automotriz',
  lavado: 'automotriz',
  // regalos
  floreria: 'regalos',
  regalos: 'regalos',
  souvenir: 'regalos',
  artesanias: 'regalos',
  juguetes: 'regalos',
};

/** Devuelve la familia de un rubro, o null si no está mapeado. */
export function getFamilyForRubro(rubroSlug) {
  return RUBRO_FAMILY_MAP[String(rubroSlug || '').trim().toLowerCase()] || null;
}
