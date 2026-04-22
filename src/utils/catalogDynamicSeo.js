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

function parseJsonObject(value) {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getRelatedRubro(business) {
  const rubro = business?.wa_rubros;
  if (Array.isArray(rubro)) return rubro[0] || null;
  return rubro || null;
}

function pickText(payload, key) {
  const raw = payload?.[key];
  if (typeof raw !== 'string') return '';
  return cleanSentence(raw);
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

function toKeywordSet(values) {
  return values.map(normalizeText);
}

export const CATALOG_SEO_FAMILIES = {
  moda: {
    label: 'Moda y vestuario',
    templates: {
      visible: ({ name, location, categorySnippet }) =>
        `${name} ofrece un catalogo online de moda${location ? ` en ${location}` : ''} para revisar prendas, calzado y accesorios con compra directa por WhatsApp${categorySnippet ? `. Explora opciones como ${categorySnippet}` : ''}.`,
      meta: ({ name, location, categorySnippet }) =>
        `Descubre el catalogo de ${name}${location ? ` en ${location}` : ''} con prendas, calzado y accesorios${categorySnippet ? ` como ${categorySnippet}` : ''}. Compra por WhatsApp de forma rapida.`,
      og: ({ name, location }) =>
        `Explora el catalogo de ${name}${location ? ` en ${location}` : ''} y pide moda, calzado y accesorios por WhatsApp.`,
    },
  },
  gastronomia: {
    label: 'Gastronomia y alimentos',
    templates: {
      visible: ({ name, location, categorySnippet }) =>
        `${name} comparte su catalogo online${location ? ` en ${location}` : ''} para ver menu, especialidades y productos listos para pedir por WhatsApp${categorySnippet ? `. Encuentra ${categorySnippet}` : ''}.`,
      meta: ({ name, location, categorySnippet }) =>
        `Mira el catalogo de ${name}${location ? ` en ${location}` : ''} con menu, bebidas y opciones para pedir por WhatsApp${categorySnippet ? `, incluyendo ${categorySnippet}` : ''}.`,
      og: ({ name, location }) =>
        `Revisa el menu y los productos de ${name}${location ? ` en ${location}` : ''} y haz tu pedido por WhatsApp.`,
    },
  },
  belleza: {
    label: 'Belleza y cuidado personal',
    templates: {
      visible: ({ name, location, categorySnippet }) =>
        `${name} presenta un catalogo online${location ? ` en ${location}` : ''} con productos y servicios de belleza para consultar por WhatsApp${categorySnippet ? `. Puedes explorar ${categorySnippet}` : ''}.`,
      meta: ({ name, location, categorySnippet }) =>
        `Conoce el catalogo de ${name}${location ? ` en ${location}` : ''} con opciones de belleza y cuidado personal${categorySnippet ? ` como ${categorySnippet}` : ''}. Reserva o consulta por WhatsApp.`,
      og: ({ name, location }) =>
        `Descubre el catalogo de belleza de ${name}${location ? ` en ${location}` : ''} y consulta por WhatsApp.`,
    },
  },
  salud: {
    label: 'Salud y bienestar',
    templates: {
      visible: ({ name, location, categorySnippet }) =>
        `${name} tiene un catalogo online${location ? ` en ${location}` : ''} para conocer servicios, productos o atenciones de salud y bienestar${categorySnippet ? `, incluyendo ${categorySnippet}` : ''}, con contacto directo por WhatsApp.`,
      meta: ({ name, location, categorySnippet }) =>
        `Revisa el catalogo de ${name}${location ? ` en ${location}` : ''} con servicios y productos de salud${categorySnippet ? ` como ${categorySnippet}` : ''}. Contacto rapido por WhatsApp.`,
      og: ({ name, location }) =>
        `Consulta el catalogo de ${name}${location ? ` en ${location}` : ''} y solicita informacion por WhatsApp.`,
    },
  },
  tecnologia: {
    label: 'Tecnologia y electronica',
    templates: {
      visible: ({ name, location, categorySnippet }) =>
        `${name} publica su catalogo online${location ? ` en ${location}` : ''} para mostrar equipos, accesorios y soluciones tecnologicas con atencion por WhatsApp${categorySnippet ? `. Revisa ${categorySnippet}` : ''}.`,
      meta: ({ name, location, categorySnippet }) =>
        `Explora el catalogo de ${name}${location ? ` en ${location}` : ''} con productos de tecnologia y electronica${categorySnippet ? ` como ${categorySnippet}` : ''}. Compra o consulta por WhatsApp.`,
      og: ({ name, location }) =>
        `Mira el catalogo de tecnologia de ${name}${location ? ` en ${location}` : ''} y consulta por WhatsApp.`,
    },
  },
  hogar: {
    label: 'Hogar, ferreteria y construccion',
    templates: {
      visible: ({ name, location, categorySnippet }) =>
        `${name} ofrece un catalogo online${location ? ` en ${location}` : ''} con productos para hogar, mejoras y construccion${categorySnippet ? `, incluyendo ${categorySnippet}` : ''}, con pedidos y consultas por WhatsApp.`,
      meta: ({ name, location, categorySnippet }) =>
        `Conoce el catalogo de ${name}${location ? ` en ${location}` : ''} con soluciones para hogar y construccion${categorySnippet ? ` como ${categorySnippet}` : ''}. Compra por WhatsApp.`,
      og: ({ name, location }) =>
        `Explora el catalogo de ${name}${location ? ` en ${location}` : ''} para hogar y construccion por WhatsApp.`,
    },
  },
  mascotas: {
    label: 'Mascotas',
    templates: {
      visible: ({ name, location, categorySnippet }) =>
        `${name} comparte un catalogo online${location ? ` en ${location}` : ''} con productos y servicios para mascotas${categorySnippet ? ` como ${categorySnippet}` : ''}, listo para consultas y pedidos por WhatsApp.`,
      meta: ({ name, location, categorySnippet }) =>
        `Visita el catalogo de ${name}${location ? ` en ${location}` : ''} con alimentos, accesorios y servicios para mascotas${categorySnippet ? ` como ${categorySnippet}` : ''}.`,
      og: ({ name, location }) =>
        `Revisa el catalogo de ${name}${location ? ` en ${location}` : ''} para mascotas y pide por WhatsApp.`,
    },
  },
  joyeria: {
    label: 'Joyeria y accesorios',
    templates: {
      visible: ({ name, location, categorySnippet }) =>
        `${name} muestra su catalogo online${location ? ` en ${location}` : ''} con joyas y accesorios para consultar disponibilidad, detalles y pedidos por WhatsApp${categorySnippet ? `. Descubre ${categorySnippet}` : ''}.`,
      meta: ({ name, location, categorySnippet }) =>
        `Descubre el catalogo de ${name}${location ? ` en ${location}` : ''} con joyas y accesorios${categorySnippet ? ` como ${categorySnippet}` : ''}. Consulta por WhatsApp.`,
      og: ({ name, location }) =>
        `Explora el catalogo de joyeria y accesorios de ${name}${location ? ` en ${location}` : ''}.`,
    },
  },
  servicios: {
    label: 'Servicios',
    templates: {
      visible: ({ name, location, categorySnippet }) =>
        `${name} presenta un catalogo online${location ? ` en ${location}` : ''} para conocer servicios, soluciones y formas de contacto${categorySnippet ? ` como ${categorySnippet}` : ''}, todo con atencion por WhatsApp.`,
      meta: ({ name, location, categorySnippet }) =>
        `Conoce el catalogo de ${name}${location ? ` en ${location}` : ''} con servicios y atencion personalizada${categorySnippet ? ` como ${categorySnippet}` : ''}.`,
      og: ({ name, location }) =>
        `Consulta los servicios de ${name}${location ? ` en ${location}` : ''} desde su catalogo online.`,
    },
  },
  general: {
    label: 'General',
    templates: {
      visible: ({ name, location, categorySnippet }) =>
        `${name} tiene un catalogo online${location ? ` en ${location}` : ''} para ver productos o servicios disponibles y consultar por WhatsApp${categorySnippet ? `. Tambien puedes explorar ${categorySnippet}` : ''}.`,
      meta: ({ name, location, categorySnippet }) =>
        `Mira el catalogo de ${name}${location ? ` en ${location}` : ''} con productos y servicios disponibles${categorySnippet ? `, incluyendo ${categorySnippet}` : ''}. Contacto por WhatsApp.`,
      og: ({ name, location }) =>
        `Explora el catalogo online de ${name}${location ? ` en ${location}` : ''} y contacta por WhatsApp.`,
    },
  },
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

function buildTemplateSeoContent(input, familyKey) {
  const safeFamilyKey = CATALOG_SEO_FAMILIES[familyKey] ? familyKey : 'general';
  const payload = buildTemplatePayload(input);
  const templates = CATALOG_SEO_FAMILIES[safeFamilyKey].templates;

  return {
    familyKey: safeFamilyKey,
    visibleDescription: cleanSentence(templates.visible(payload)),
    metaDescription: truncateText(templates.meta(payload), 160),
    ogDescription: truncateText(templates.og(payload), 200),
  };
}

export function resolveCatalogSeoContent({ business, products = [], businessCategories = [] } = {}) {
  const familyResolution = resolveCatalogSeoFamily({ business, products, businessCategories });
  const templateContent = buildTemplateSeoContent(
    { business, products, businessCategories },
    familyResolution.familyKey
  );

  const manual = parseJsonObject(business?.seoContentOverride || business?.seo_content_override);
  const ai = parseJsonObject(business?.seoContentAi || business?.seo_content_ai);

  const visibleDescription =
    pickText(manual, 'visibleDescription') ||
    pickText(manual, 'about') ||
    pickText(ai, 'visibleDescription') ||
    pickText(ai, 'about') ||
    templateContent.visibleDescription;

  const metaDescription =
    pickText(manual, 'metaDescription') ||
    pickText(ai, 'metaDescription') ||
    templateContent.metaDescription;

  const ogDescription =
    pickText(manual, 'ogDescription') ||
    pickText(ai, 'ogDescription') ||
    templateContent.ogDescription;

  const visibleSource =
    pickText(manual, 'visibleDescription') || pickText(manual, 'about')
      ? 'manual'
      : pickText(ai, 'visibleDescription') || pickText(ai, 'about')
        ? 'ai'
        : familyResolution.matchedBy === 'fallback'
          ? 'fallback'
          : 'template';

  const metaSource =
    pickText(manual, 'metaDescription')
      ? 'manual'
      : pickText(ai, 'metaDescription')
        ? 'ai'
        : familyResolution.matchedBy === 'fallback'
          ? 'fallback'
          : 'template';

  const ogSource =
    pickText(manual, 'ogDescription')
      ? 'manual'
      : pickText(ai, 'ogDescription')
        ? 'ai'
        : familyResolution.matchedBy === 'fallback'
          ? 'fallback'
          : 'template';

  return {
    familyKey: templateContent.familyKey,
    familyLabel: CATALOG_SEO_FAMILIES[templateContent.familyKey]?.label || CATALOG_SEO_FAMILIES.general.label,
    visibleDescription,
    metaDescription: truncateText(metaDescription, 160),
    ogDescription: truncateText(ogDescription, 200),
    source: {
      visibleDescription: visibleSource,
      metaDescription: metaSource,
      ogDescription: ogSource,
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
