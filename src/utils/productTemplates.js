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
 * por ahora; idealmente migrar a R2 después) y products[] con name,
 * description, price (entero, moneda local) y las imágenes para
 * wa_products.card_image_url / wa_products.thumbnail_url.
 */

const unsplashCard = (id) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=900&q=80`;
const unsplashThumb = (id) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=320&q=70`;
const unsplashCover = (id) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1600&h=600&q=80`;

/**
 * Logo como SVG data-URL (icono simple sobre degradado). No usar fotos como
 * logo: el data-URL carga instantáneo, sin red, y cfImageUrl lo deja pasar
 * sin transformar — evita el círculo gris de placeholder en el catálogo.
 */
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
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

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

const templateProduct = ({ name, description, price, photoId }) => ({
  name,
  description,
  price,
  cardImageUrl: unsplashCard(photoId),
  thumbnailUrl: unsplashThumb(photoId),
});

export const PRODUCT_TEMPLATES = {
  ropa: {
    logoUrl: LOGO_ROPA,
    coverImageUrl: unsplashCover('1441986300917-64674bd600d8'),
    products: [
      templateProduct({
        name: 'Polera básica de algodón',
        description: 'Polera unisex de algodón 100%, suave y fresca. Disponible en varios colores y tallas.',
        price: 9990,
        photoId: '1521572163474-6864f9cf17ab',
      }),
      templateProduct({
        name: 'Jeans clásico',
        description: 'Jeans de corte recto, cómodo y resistente para el uso diario.',
        price: 19990,
        photoId: '1542272604-787c3835535d',
      }),
      templateProduct({
        name: 'Polerón con capucha',
        description: 'Polerón abrigado con capucha y bolsillo canguro. Ideal para media estación.',
        price: 17990,
        photoId: '1556821840-3a63f95609a7',
      }),
      templateProduct({
        name: 'Chaqueta urbana',
        description: 'Chaqueta liviana de estilo urbano, perfecta para combinar con cualquier outfit.',
        price: 29990,
        photoId: '1551028719-00167b16eac5',
      }),
      templateProduct({
        name: 'Vestido casual',
        description: 'Vestido casual de tela fresca, cómodo para el día a día.',
        price: 22990,
        photoId: '1595777457583-95e059d581b8',
      }),
      templateProduct({
        name: 'Zapatillas urbanas',
        description: 'Zapatillas cómodas y versátiles para acompañar tu look diario.',
        price: 34990,
        photoId: '1542291026-7eec264c27ff',
      }),
    ],
  },

  restaurante: {
    logoUrl: LOGO_RESTAURANTE,
    coverImageUrl: unsplashCover('1517248135467-4c7edcad34c4'),
    products: [
      templateProduct({
        name: 'Hamburguesa de la casa',
        description: 'Hamburguesa con queso derretido, lechuga, tomate y nuestra salsa especial. Incluye papas fritas.',
        price: 8990,
        photoId: '1568901346375-23c9450c58cd',
      }),
      templateProduct({
        name: 'Pizza artesanal',
        description: 'Pizza a la piedra con masa artesanal, salsa de tomate natural y queso mozzarella.',
        price: 11990,
        photoId: '1513104890138-7c749659a591',
      }),
      templateProduct({
        name: 'Ensalada fresca',
        description: 'Mix de hojas verdes, palta, tomates cherry y aderezo de la casa.',
        price: 6990,
        photoId: '1546069901-ba9599a7e63c',
      }),
      templateProduct({
        name: 'Pasta de la casa',
        description: 'Pasta fresca con salsa a elección, terminada con queso parmesano.',
        price: 9490,
        photoId: '1551183053-bf91a1d81141',
      }),
      templateProduct({
        name: 'Panqueques dulces',
        description: 'Torre de panqueques con miel de maple y frutas frescas. Perfecto para compartir.',
        price: 4990,
        photoId: '1567620905732-2d1ec7ab7445',
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
 * { templateKey, logoUrl, coverImageUrl, products } — o null si no hay template.
 */
export function getTemplateForRubro(rubroSlug) {
  const templateKey = RUBRO_SLUG_TO_TEMPLATE[String(rubroSlug || '').trim().toLowerCase()];
  const template = templateKey ? PRODUCT_TEMPLATES[templateKey] : null;
  if (!template) return null;
  return {
    templateKey,
    ...template,
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
