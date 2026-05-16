function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function cleanSentence(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function truncateText(value, maxLength) {
  const text = cleanSentence(value);
  if (!text || text.length <= maxLength) return text;
  const sliced = text.slice(0, Math.max(0, maxLength - 1));
  const safe = sliced.replace(/[,:;.\s]+$/g, '');
  return `${safe}...`;
}

function getRelatedRubro(business) {
  const rubro = business?.wa_rubros;
  if (Array.isArray(rubro)) return rubro[0] || null;
  return rubro || null;
}

function buildCategorySnippet(categories = []) {
  const list = [...new Set((categories || []).map((item) => cleanSentence(item)).filter(Boolean))].slice(0, 3);
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} y ${list[1]}`;
  return `${list[0]}, ${list[1]} y ${list[2]}`;
}

function buildLocationLabel(city, region, country) {
  const c = cleanSentence(city);
  if (c) return c;
  const r = cleanSentence(region);
  if (r) return r;
  return cleanSentence(country);
}

const COUNTRY_CODE_LABELS = {
  AR: 'Argentina',
  BO: 'Bolivia',
  BR: 'Brasil',
  CL: 'Chile',
  CO: 'Colombia',
  CR: 'Costa Rica',
  EC: 'Ecuador',
  GT: 'Guatemala',
  MX: 'Mexico',
  PA: 'Panama',
  PE: 'Peru',
  PY: 'Paraguay',
  UY: 'Uruguay',
  US: 'Estados Unidos',
};

function getCountryLabel(business = {}) {
  const explicit = cleanSentence(business?.country);
  if (explicit) return explicit;
  const code = String(
    business?.countryCode ||
    business?.country_code ||
    business?.routingCountryCode ||
    ''
  ).trim().toUpperCase();
  return COUNTRY_CODE_LABELS[code] || '';
}

function isRestaurantCatalog(business = {}) {
  const mode = normalizeText(business?.businessMode || business?.business_mode);
  return mode === 'restaurant' || mode === 'restaurante';
}

function buildNeutralVisibleDescription(business = {}) {
  const name = cleanSentence(business?.name) || 'Este negocio';
  const realDescription = cleanSentence(business?.description);
  if (realDescription) return realDescription;
  if (isRestaurantCatalog(business)) {
    return `${name} ofrece un menu online con pedidos y consultas por WhatsApp.`;
  }
  const country = getCountryLabel(business);
  return `${name} ofrece un catalogo online${country ? ` en ${country}` : ''} con pedidos y consultas por WhatsApp.`;
}

function buildNeutralMetaDescription(business = {}) {
  return truncateText(buildNeutralVisibleDescription(business), 160);
}

function buildNeutralOgDescription(business = {}) {
  return truncateText(buildNeutralVisibleDescription(business), 200);
}

function toKeywordSet(values) {
  return values.map(normalizeText);
}

export const CATALOG_SEO_FAMILIES = {
  moda: { label: 'Moda y vestuario' },
  gastronomia: { label: 'Gastronomia y alimentos' },
  belleza: { label: 'Belleza y cuidado personal' },
  salud: { label: 'Salud y bienestar' },
  tecnologia: { label: 'Tecnologia y electronica' },
  hogar: { label: 'Hogar, ferreteria y construccion' },
  mascotas: { label: 'Mascotas' },
  joyeria: { label: 'Joyeria y accesorios' },
  servicios: { label: 'Servicios' },
  general: { label: 'General' },
};

const RUBRO_TO_FAMILY_MAP = {
  ropa: 'moda',
  indumentaria: 'moda',
  calzado: 'moda',
  boutique: 'moda',
  accesorios: 'moda',
  joyeria: 'joyeria',
  bisuteria: 'joyeria',
  relojeria: 'joyeria',
  comida: 'gastronomia',
  restaurant: 'gastronomia',
  restaurante: 'gastronomia',
  cafeteria: 'gastronomia',
  panaderia: 'gastronomia',
  pasteleria: 'gastronomia',
  bar: 'gastronomia',
  belleza: 'belleza',
  peluqueria: 'belleza',
  barberia: 'belleza',
  estetica: 'belleza',
  perfumeria: 'belleza',
  salud: 'salud',
  farmacia: 'salud',
  optica: 'salud',
  dental: 'salud',
  tecnologia: 'tecnologia',
  electronica: 'tecnologia',
  computacion: 'tecnologia',
  celulares: 'tecnologia',
  ferreteria: 'hogar',
  construccion: 'hogar',
  hogar: 'hogar',
  muebles: 'hogar',
  decoracion: 'hogar',
  mascotas: 'mascotas',
  veterinaria: 'mascotas',
  petshop: 'mascotas',
  servicios: 'servicios',
  consultoria: 'servicios',
  imprenta: 'servicios',
  marketing: 'servicios',
  legal: 'servicios',
};

const FAMILY_KEYWORDS = {
  moda: toKeywordSet(['ropa', 'moda', 'indumentaria', 'calzado', 'vestido', 'jeans', 'boutique', 'prenda']),
  gastronomia: toKeywordSet(['comida', 'menu', 'pizza', 'hamburguesa', 'cafeteria', 'panaderia', 'bebidas', 'delivery']),
  belleza: toKeywordSet(['belleza', 'peluqueria', 'barberia', 'cosmetica', 'perfume', 'maquillaje', 'unas', 'spa']),
  salud: toKeywordSet(['salud', 'farmacia', 'bienestar', 'optica', 'terapia', 'medico', 'clinica', 'dental']),
  tecnologia: toKeywordSet(['tecnologia', 'electronica', 'celular', 'laptop', 'audio', 'gaming', 'computacion', 'accesorios']),
  hogar: toKeywordSet(['ferreteria', 'hogar', 'muebles', 'decoracion', 'herramientas', 'pintura', 'griferia', 'jardin']),
  mascotas: toKeywordSet(['mascotas', 'perro', 'gato', 'pet', 'veterinaria', 'alimento', 'correa', 'arena']),
  joyeria: toKeywordSet(['joyeria', 'joyas', 'anillos', 'collares', 'aros', 'pulseras', 'relojes', 'accesorios']),
  servicios: toKeywordSet(['servicios', 'consultoria', 'asesoria', 'instalacion', 'mantenimiento', 'reparacion', 'clases', 'diseno']),
};

function extractCategoryNames(products = [], businessCategories = []) {
  const productCategories = (products || []).map((product) => product?.category);
  const catalogCategories = (businessCategories || []).map((category) => category?.name || category);
  return [...new Set([...productCategories, ...catalogCategories].map((item) => cleanSentence(item)).filter(Boolean))];
}

export function resolveCatalogSeoFamily({ business, products = [], businessCategories = [] } = {}) {
  const relatedRubro = getRelatedRubro(business);
  const familyOverride = cleanSentence(business?.seoFamilyKey || business?.seo_family_key);
  if (familyOverride && CATALOG_SEO_FAMILIES[familyOverride]) {
    return { familyKey: familyOverride, matchedBy: 'family_override' };
  }

  const rubroSlug = normalizeText(business?.rubroSlug || business?.rubro_slug || relatedRubro?.slug);
  if (rubroSlug && RUBRO_TO_FAMILY_MAP[rubroSlug]) {
    return { familyKey: RUBRO_TO_FAMILY_MAP[rubroSlug], matchedBy: 'rubro_slug' };
  }

  const rubroName = normalizeText(business?.rubroName || business?.rubro_name || relatedRubro?.name);
  if (rubroName && RUBRO_TO_FAMILY_MAP[rubroName]) {
    return { familyKey: RUBRO_TO_FAMILY_MAP[rubroName], matchedBy: 'rubro_name' };
  }

  const haystack = normalizeText(
    [
      business?.rubroSlug,
      business?.rubroName,
      business?.description,
      ...extractCategoryNames(products, businessCategories),
    ].join(' ')
  );

  let bestFamily = 'general';
  let bestScore = 0;

  for (const [familyKey, keywords] of Object.entries(FAMILY_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      if (haystack.includes(keyword)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestFamily = familyKey;
    }
  }

  if (bestScore === 0) {
    return { familyKey: 'general', matchedBy: 'fallback' };
  }

  return { familyKey: bestFamily, matchedBy: 'keywords' };
}

function buildTemplatePayload({ business, products = [], businessCategories = [] } = {}) {
  const name = cleanSentence(business?.name) || 'este negocio';
  const location = buildLocationLabel(business?.city, business?.region, business?.country);
  const categorySnippet = buildCategorySnippet(extractCategoryNames(products, businessCategories));
  return { name, location, categorySnippet };
}

export function resolveCatalogSeoContent({ business, products = [], businessCategories = [] } = {}) {
  const familyResolution = resolveCatalogSeoFamily({ business, products, businessCategories });
  const safeFamilyKey = CATALOG_SEO_FAMILIES[familyResolution.familyKey] ? familyResolution.familyKey : 'general';

  const realDescription = cleanSentence(business?.description);
  const visibleDescription = buildNeutralVisibleDescription(business);
  const metaDescription = buildNeutralMetaDescription(business);
  const ogDescription = buildNeutralOgDescription(business);
  const descriptionSource = realDescription
    ? 'business_description'
    : isRestaurantCatalog(business)
      ? 'restaurant_neutral'
      : 'neutral';

  return {
    familyKey: safeFamilyKey,
    familyLabel: CATALOG_SEO_FAMILIES[safeFamilyKey]?.label || CATALOG_SEO_FAMILIES.general.label,
    visibleDescription,
    visibleSecondaryDescription: 'Contacta por WhatsApp para consultar disponibilidad, precios y detalles.',
    metaDescription: truncateText(metaDescription, 160),
    ogDescription: truncateText(ogDescription, 200),
    source: {
      visibleDescription: descriptionSource,
      metaDescription: descriptionSource,
      ogDescription: descriptionSource,
    },
    debug: {
      familyMatch: familyResolution.matchedBy,
    },
  };
}

export function buildCatalogSeoAiPayload({ business, familyKey, visibleDescription, metaDescription, ogDescription, model }) {
  return {
    familyKey: familyKey || 'general',
    visibleDescription: cleanSentence(visibleDescription),
    metaDescription: truncateText(metaDescription, 160),
    ogDescription: truncateText(ogDescription, 200),
    model: cleanSentence(model),
    generatedAt: new Date().toISOString(),
    businessName: cleanSentence(business?.name),
    rubroSlug: cleanSentence(business?.rubroSlug || business?.rubro_slug),
    city: cleanSentence(business?.city),
  };
}

export function buildCatalogSeoAiPrompt({ business, products = [], businessCategories = [], familyKey } = {}) {
  const payload = buildTemplatePayload({ business, products, businessCategories });
  return [
    'Genera contenido SEO corto en espanol para un catalogo publico de WhatsApp.',
    'Responde solo JSON valido con las claves: visibleDescription, metaDescription, ogDescription.',
    'Reglas: visibleDescription 200-260 caracteres, metaDescription maximo 160, ogDescription maximo 200.',
    'Incluye el nombre del negocio. Incluye ciudad solo si existe. No uses relleno, hashtags, comillas ni emojis.',
    `Negocio: ${payload.name}`,
    `Ciudad o ubicacion: ${payload.location || 'sin ciudad'}`,
    `Familia semantica: ${familyKey || 'general'}`,
    `Rubro: ${cleanSentence(business?.rubroName || business?.rubroSlug) || 'sin rubro'}`,
    `Categorias detectadas: ${payload.categorySnippet || 'sin categorias claras'}`,
  ].join('\n');
}
