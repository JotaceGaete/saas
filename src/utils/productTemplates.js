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
const unsplashLogo = (id) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=256&h=256&q=80`;
const unsplashCover = (id) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1600&h=600&q=80`;

const templateProduct = ({ name, description, price, photoId }) => ({
  name,
  description,
  price,
  cardImageUrl: unsplashCard(photoId),
  thumbnailUrl: unsplashThumb(photoId),
});

export const PRODUCT_TEMPLATES = {
  ropa: {
    logoUrl: unsplashLogo('1489987707025-afc232f7bdcf'),
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
    logoUrl: unsplashLogo('1414235077428-338989a2e8c0'),
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
  return { templateKey, ...template };
}

/**
 * Devuelve los productos de ejemplo para un slug de rubro,
 * o [] si el rubro no tiene template definido.
 */
export function getTemplateProductsForRubro(rubroSlug) {
  return getTemplateForRubro(rubroSlug)?.products ?? [];
}
