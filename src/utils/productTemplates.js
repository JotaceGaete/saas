/**
 * Templates por rubro: productos de ejemplo + identidad visual (logo y cover).
 *
 * Se usan para sembrar automáticamente el catálogo y el branding de un negocio
 * recién configurado (ver src/services/productTemplateService.js). No existe UI
 * de templates: el usuario nunca los "instala", solo los edita después desde
 * /product-editor y /business-configuration.
 *
 * Claves de PRODUCT_TEMPLATES: clave interna del template.
 * RUBRO_SLUG_TO_TEMPLATE: mapea wa_rubros.slug → clave de template.
 *
 * Cada template: logoUrl y coverImageUrl prediseñados (placeholders públicos
 * por ahora; idealmente migrar a R2 después), categories[] con { name, slug }
 * (se siembran como wa_business_categories del negocio) y products[] con name,
 * description, price (entero, moneda local), categorySlug (referencia a
 * categories[].slug; el producto guarda el NOMBRE en wa_products.category,
 * que es como el catálogo público asocia producto↔categoría) y las imágenes
 * para wa_products.card_image_url / wa_products.thumbnail_url.
 */

const unsplashCard = (id) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=900&q=80`;
const unsplashThumb = (id) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=320&q=70`;
const unsplashCover = (id) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1600&h=600&q=80`;

/**
 * Logo como SVG data-URL en base64 (icono simple sobre degradado). No usar
 * fotos como logo: el data-URL carga instantáneo, sin red, y cfImageUrl lo
 * deja pasar sin transformar — evita el círculo gris de placeholder en el
 * catálogo. Base64 (RFC 2397) en vez de ";utf8," porque ese parámetro es
 * inválido y algunos navegadores/contextos no lo renderizan.
 */
function toBase64(value) {
  if (typeof btoa === 'function') return btoa(value);
  // eslint-disable-next-line no-undef
  return Buffer.from(value, 'utf-8').toString('base64');
}

function svgLogoDataUrl({ from, to, paths }) {
  const icon = paths.map((d) => `<path d="${d}"/>`).join('');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="-7 -7 38 38">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>` +
    `</linearGradient></defs>` +
    `<rect x="-7" y="-7" width="38" height="38" fill="url(#g)"/>` +
    `<g fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${icon}</g>` +
    `</svg>`;
  return `data:image/svg+xml;base64,${toBase64(svg)}`;
}

/**
 * Prefijo del formato anterior de logos de template (parámetro ";utf8,"
 * inválido). Sirve para detectar y reparar logos sembrados con ese formato;
 * solo puede venir de templates, nunca de un upload del usuario.
 */
export const LEGACY_TEMPLATE_LOGO_PREFIX = 'data:image/svg+xml;utf8,';

// Iconos estilo lucide: polera (ropa), cubiertos (restaurante), tienda (default).
const LOGO_ROPA = svgLogoDataUrl({
  from: '#8B5CF6',
  to: '#6D28D9',
  paths: [
    'M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z',
  ],
});
const LOGO_RESTAURANTE = svgLogoDataUrl({
  from: '#FB923C',
  to: '#EA580C',
  paths: [
    'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2',
    'M7 2v20',
    'M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7',
  ],
});
export const DEFAULT_TEMPLATE_LOGO_URL = svgLogoDataUrl({
  from: '#475569',
  to: '#1E293B',
  paths: [
    'm2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7',
    'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8',
    'M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4',
    'M2 7h20',
    'M22 7v3a2 2 0 0 1-2 2 2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7',
  ],
});

/**
 * Redes sociales demo de Ventalink: solo para llenar visualmente la sección
 * "Síguenos" de un catálogo nuevo. Se aplican una única vez (flag
 * demoSocialLinksApplied en design_settings) y nunca pisan redes del usuario.
 */
export const DEMO_SOCIAL_LINKS = {
  instagramUrl: 'https://www.instagram.com/ventalink.app',
  facebookUrl: 'https://www.facebook.com/ventalink.app',
  tiktokUrl: 'https://www.tiktok.com/@ventalink.app',
};

const templateProduct = ({ name, description, price, photoId, categorySlug = null }) => ({
  name,
  description,
  price,
  categorySlug,
  cardImageUrl: unsplashCard(photoId),
  thumbnailUrl: unsplashThumb(photoId),
});

export const PRODUCT_TEMPLATES = {
  ropa: {
    logoUrl: LOGO_ROPA,
    coverImageUrl: unsplashCover('1441986300917-64674bd600d8'),
    categories: [
      { name: 'Poleras', slug: 'poleras' },
      { name: 'Pantalones', slug: 'pantalones' },
      { name: 'Chaquetas', slug: 'chaquetas' },
      { name: 'Vestidos', slug: 'vestidos' },
      { name: 'Calzado', slug: 'calzado' },
      { name: 'Accesorios', slug: 'accesorios' },
    ],
    products: [
      templateProduct({
        name: 'Polera Básica',
        description: 'Polera unisex de algodón 100%, suave y fresca. Disponible en varios colores y tallas.',
        price: 9990,
        photoId: '1521572163474-6864f9cf17ab',
        categorySlug: 'poleras',
      }),
      templateProduct({
        name: 'Polera Oversize',
        description: 'Polera de corte oversize, cómoda y moderna. Perfecta para un look relajado.',
        price: 12990,
        photoId: '1503341504253-dff4815485f1',
        categorySlug: 'poleras',
      }),
      templateProduct({
        name: 'Jeans Clásico',
        description: 'Jeans de corte recto, cómodo y resistente para el uso diario.',
        price: 19990,
        photoId: '1542272604-787c3835535d',
        categorySlug: 'pantalones',
      }),
      templateProduct({
        name: 'Pantalón Cargo',
        description: 'Pantalón cargo con bolsillos laterales, resistente y versátil.',
        price: 24990,
        photoId: '1542272604-787c3835535d',
        categorySlug: 'pantalones',
      }),
      templateProduct({
        name: 'Chaqueta Urbana',
        description: 'Chaqueta liviana de estilo urbano, perfecta para combinar con cualquier outfit.',
        price: 29990,
        photoId: '1551028719-00167b16eac5',
        categorySlug: 'chaquetas',
      }),
      templateProduct({
        name: 'Polerón Canguro',
        description: 'Polerón abrigado con capucha y bolsillo canguro. Ideal para media estación.',
        price: 17990,
        photoId: '1556821840-3a63f95609a7',
        categorySlug: 'chaquetas',
      }),
      templateProduct({
        name: 'Vestido Casual',
        description: 'Vestido casual de tela fresca, cómodo para el día a día.',
        price: 22990,
        photoId: '1595777457583-95e059d581b8',
        categorySlug: 'vestidos',
      }),
      templateProduct({
        name: 'Vestido Primavera',
        description: 'Vestido liviano de temporada, fresco y con caída elegante.',
        price: 24990,
        photoId: '1595777457583-95e059d581b8',
        categorySlug: 'vestidos',
      }),
      templateProduct({
        name: 'Zapatillas Urbanas',
        description: 'Zapatillas cómodas y versátiles para acompañar tu look diario.',
        price: 34990,
        photoId: '1542291026-7eec264c27ff',
        categorySlug: 'calzado',
      }),
      templateProduct({
        name: 'Sandalias',
        description: 'Sandalias livianas y cómodas, ideales para los días de calor.',
        price: 15990,
        photoId: '1542291026-7eec264c27ff',
        categorySlug: 'calzado',
      }),
      templateProduct({
        name: 'Gorro de Lana',
        description: 'Gorro tejido de lana suave, abrigado y con estilo para el invierno.',
        price: 6990,
        photoId: '1576871337622-98d48d1cf531',
        categorySlug: 'accesorios',
      }),
      templateProduct({
        name: 'Cartera Pequeña',
        description: 'Cartera compacta de uso diario, con espacio para lo esencial.',
        price: 14990,
        photoId: '1611591437281-460bfbe1220a',
        categorySlug: 'accesorios',
      }),
    ],
  },

  restaurante: {
    logoUrl: LOGO_RESTAURANTE,
    coverImageUrl: unsplashCover('1517248135467-4c7edcad34c4'),
    categories: [
      { name: 'Entradas', slug: 'entradas' },
      { name: 'Platos principales', slug: 'platos-principales' },
      { name: 'Combos', slug: 'combos' },
      { name: 'Postres', slug: 'postres' },
      { name: 'Bebidas', slug: 'bebidas' },
    ],
    products: [
      templateProduct({
        name: 'Empanadas',
        description: 'Empanadas caseras horneadas, rellenas con ingredientes frescos. Unidad.',
        price: 2990,
        photoId: '1601050690597-df0568f70950',
        categorySlug: 'entradas',
      }),
      templateProduct({
        name: 'Papas Fritas',
        description: 'Porción de papas fritas crujientes, perfectas para compartir.',
        price: 3990,
        photoId: '1573080496219-bb080dd4f877',
        categorySlug: 'entradas',
      }),
      templateProduct({
        name: 'Ensalada César',
        description: 'Lechuga fresca, pollo grillado, crutones y aderezo césar de la casa.',
        price: 6990,
        photoId: '1546069901-ba9599a7e63c',
        categorySlug: 'entradas',
      }),
      templateProduct({
        name: 'Hamburguesa Clásica',
        description: 'Hamburguesa con queso derretido, lechuga, tomate y nuestra salsa especial.',
        price: 8990,
        photoId: '1568901346375-23c9450c58cd',
        categorySlug: 'platos-principales',
      }),
      templateProduct({
        name: 'Pizza Familiar',
        description: 'Pizza familiar a la piedra con masa artesanal y queso mozzarella.',
        price: 12990,
        photoId: '1513104890138-7c749659a591',
        categorySlug: 'platos-principales',
      }),
      templateProduct({
        name: 'Pollo con Papas',
        description: 'Pollo dorado acompañado de papas fritas. Contundente y sabroso.',
        price: 9990,
        photoId: '1598103442097-8b74394b95c6',
        categorySlug: 'platos-principales',
      }),
      templateProduct({
        name: 'Combo Familiar',
        description: 'Combo para compartir: incluye plato principal, acompañamientos y bebidas.',
        price: 19990,
        photoId: '1571091718767-18b5b1457add',
        categorySlug: 'combos',
      }),
      templateProduct({
        name: 'Menú del Día',
        description: 'Plato del día con entrada y bebida incluida. Pregunta por el menú de hoy.',
        price: 7990,
        photoId: '1559847844-5315695dadae',
        categorySlug: 'combos',
      }),
      templateProduct({
        name: 'Panqueque con Manjar',
        description: 'Panqueques caseros rellenos con manjar. Un clásico irresistible.',
        price: 4990,
        photoId: '1567620905732-2d1ec7ab7445',
        categorySlug: 'postres',
      }),
      templateProduct({
        name: 'Torta Tres Leches',
        description: 'Trozo de torta tres leches, húmeda y suave, con un toque de canela.',
        price: 5990,
        photoId: '1629121003845-e96bfccd1026',
        categorySlug: 'postres',
      }),
      templateProduct({
        name: 'Bebida 350ml',
        description: 'Bebida fría en lata de 350ml. Consulta por sabores disponibles.',
        price: 1990,
        photoId: '1554866585-cd94860890b7',
        categorySlug: 'bebidas',
      }),
      templateProduct({
        name: 'Jugo Natural',
        description: 'Jugo de fruta natural recién exprimido, sin azúcar añadida.',
        price: 2990,
        photoId: '1600271886742-f049cd451bba',
        categorySlug: 'bebidas',
      }),
    ],
  },
};

/**
 * Mapa wa_rubros.slug → clave de PRODUCT_TEMPLATES.
 * Agregar aquí nuevos rubros a medida que existan templates para ellos.
 */
export const RUBRO_SLUG_TO_TEMPLATE = {
  'ropa': 'ropa',
  'comida-y-bebidas': 'restaurante',
};

/**
 * Devuelve el template completo para un slug de rubro:
 * { templateKey, logoUrl, coverImageUrl, categories, products } — o null si no hay template.
 */
export function getTemplateForRubro(rubroSlug) {
  const templateKey = RUBRO_SLUG_TO_TEMPLATE[String(rubroSlug || '').trim().toLowerCase()];
  const template = templateKey ? PRODUCT_TEMPLATES[templateKey] : null;
  if (!template) return null;
  return {
    templateKey,
    ...template,
    categories: template.categories || [],
    logoUrl: template.logoUrl || DEFAULT_TEMPLATE_LOGO_URL,
  };
}

/**
 * Devuelve los productos de ejemplo para un slug de rubro,
 * o [] si el rubro no tiene template definido.
 */
export function getTemplateProductsForRubro(rubroSlug) {
  return getTemplateForRubro(rubroSlug)?.products ?? [];
}
