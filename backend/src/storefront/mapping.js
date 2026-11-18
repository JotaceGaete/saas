import { computeAvailability } from './availability.js';
import { pickProductImage } from './images.js';

/** Columnas reales de wa_businesses que lee la API (lista blanca). */
export const BUSINESS_COLUMNS = [
  'id', 'name', 'slug', 'whatsapp', 'address', 'currency', 'logo_url', 'cover_image_url',
  'instagram_url', 'tiktok_url', 'facebook_url', 'is_active', 'design_settings',
];

/** Columnas reales de wa_products que lee la API (lista blanca; sin sku, barcode, tax_treatment ni costos). */
export const PRODUCT_COLUMNS = [
  'id', 'business_id', 'slug', 'name', 'public_code', 'description', 'long_description',
  'options_description', 'category', 'price', 'compare_at_price', 'show_price', 'on_sale',
  'featured', 'is_main_featured', 'is_active', 'status', 'is_draft', 'is_sold_out',
  'stock_actual', 'stock_minimo', 'sort_order', 'card_image_url', 'thumbnail_url', 'image_url',
  'images', 'add_ons', 'combo_config', 'video_url', 'video_thumbnail_url',
];

/** Columnas reales de wa_business_categories. */
export const CATEGORY_COLUMNS = ['id', 'business_id', 'name', 'slug'];

export const DEFAULT_PRIMARY_COLOR = '#111111';
export const DEFAULT_BACKGROUND_COLOR = '#ffffff';
export const DEFAULT_CURRENCY = 'CLP';

export function slugify(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Regla de visibilidad pública (Storefront v1.2 §2.3). */
export function isPubliclyVisible(row) {
  return row.is_active === true && row.status === 'active' && row.is_draft !== true;
}

const toNumberOrNull = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const nonEmptyString = (v) => (typeof v === 'string' && v.trim().length > 0 ? v : null);

/**
 * Fila real de wa_products → fila interna. `categorySlugByName` viene de wa_business_categories;
 * si la categoría no existe ahí, el slug se deriva del nombre. No se crean categorías.
 */
export function toInternalProductRow(db, categorySlugByName = new Map()) {
  const categoryName = nonEmptyString(db.category)?.trim() ?? null;
  // La vista ya trae category_slug; el mapa solo se usa como respaldo.
  const slugFromView = nonEmptyString(db.category_slug);
  return {
    id: String(db.id),
    slug: String(db.slug),
    name: String(db.name),
    public_code: nonEmptyString(db.public_code),
    category_name: categoryName,
    category_slug: slugFromView ?? (categoryName
      ? (categorySlugByName.get(categoryName) ?? slugify(categoryName))
      : null),
    price: Number(db.price) || 0,
    compare_at_price: toNumberOrNull(db.compare_at_price),
    show_price: db.show_price !== false,
    on_sale: db.on_sale === true,
    featured: db.featured === true,
    is_main_featured: db.is_main_featured === true,
    is_active: db.is_active === true,
    status: db.status,
    is_draft: db.is_draft === true,
    is_sold_out: db.is_sold_out === true,
    stock_actual: toNumberOrNull(db.stock_actual),
    stock_minimo: toNumberOrNull(db.stock_minimo),
    sort_order: Number(db.sort_order) || 0,
    sortOrder: Number(db.sort_order) || 0,
    short_description: nonEmptyString(db.description),
    long_description: nonEmptyString(db.long_description),
    options_description: nonEmptyString(db.options_description),
    card_image_url: nonEmptyString(db.card_image_url),
    thumbnail_url: nonEmptyString(db.thumbnail_url),
    image_url: nonEmptyString(db.image_url),
    images: Array.isArray(db.images) ? db.images : null,
    add_ons_raw: Array.isArray(db.add_ons) ? db.add_ons : [],
    combo_config_raw: db.combo_config ?? null,
    video_url: nonEmptyString(db.video_url),
    video_thumbnail_url: nonEmptyString(db.video_thumbnail_url),
  };
}

export function mapProductSummary(row) {
  const { availability, inventoryControlled } = computeAvailability({
    isSoldOut: row.is_sold_out,
    stockActual: row.stock_actual,
    stockMinimo: row.stock_minimo,
  });
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    publicCode: row.public_code,
    category: row.category_slug && row.category_name
      ? { slug: row.category_slug, name: row.category_name }
      : null,
    price: row.price,
    compareAtPrice: row.compare_at_price,
    showPrice: row.show_price,
    onSale: row.on_sale,
    featured: row.featured,
    isMainFeatured: row.is_main_featured,
    availability,
    inventoryControlled,
    image: pickProductImage(row),
    shortDescription: row.short_description,
    sortOrder: row.sort_order,
  };
}

/** Combo: solo si enabled === true y hay grupos con ítems (mismo criterio que public-product). */
export function mapCombo(comboConfig) {
  if (!comboConfig || typeof comboConfig !== 'object' || comboConfig.enabled !== true) return null;
  const groups = (Array.isArray(comboConfig.groups) ? comboConfig.groups : [])
    .filter((g) => g && typeof g === 'object')
    .map((g, gi) => ({
      id: String(g.id ?? `combo-group-${gi}`),
      label: String(g.label ?? ''),
      items: (Array.isArray(g.items) ? g.items : [])
        .filter((i) => i && typeof i === 'object')
        .map((i, ii) => {
          const p = Number(i.price);
          return {
            id: String(i.id ?? `combo-item-${ii}`),
            label: String(i.label ?? ''),
            price: i.price !== null && i.price !== undefined && Number.isFinite(p) && p >= 0 ? Math.round(p) : null,
          };
        }),
    }))
    .filter((g) => g.items.length > 0);
  return groups.length > 0 ? groups : null;
}

/**
 * Complementos públicos. Reglas del catálogo público:
 * - se omiten los active === false;
 * - tipo product: el producto relacionado debe estar visible y no ser el propio producto;
 *   el precio sale del producto relacionado; se expone productSlug, nunca productId;
 * - tipo manual: requiere label; price entero >= 0 o null.
 * `visibleById` contiene solo productos públicos de la misma tienda.
 */
export function mapAddOns(rawAddOns, selfId, visibleById) {
  const out = [];
  for (const addon of rawAddOns) {
    if (!addon || typeof addon !== 'object' || addon.active === false) continue;
    if (addon.type === 'product') {
      const related = visibleById.get(addon.productId);
      if (!related || related.id === selfId) continue;
      out.push({ type: 'product', productSlug: related.slug, label: related.name, price: Math.round(related.price) });
      continue;
    }
    if (addon.type === 'manual') {
      const label = nonEmptyString(addon.label);
      if (!label) continue;
      const price = addon.price === null || addon.price === undefined || addon.price === ''
        ? null
        : Number(addon.price);
      out.push({
        type: 'manual',
        label,
        price: price !== null && Number.isFinite(price) && price >= 0 ? Math.round(price) : null,
      });
    }
  }
  return out;
}

export function mapProductDetail(row, visibleById) {
  const gallery = (row.images ?? []).filter((u) => typeof u === 'string' && u.length > 0);
  return {
    ...mapProductSummary(row),
    longDescription: row.long_description,
    gallery,
    optionsDescription: row.options_description,
    addOns: mapAddOns(row.add_ons_raw, row.id, visibleById),
    combo: mapCombo(row.combo_config_raw),
    video: row.video_url ? { url: row.video_url, thumbnailUrl: row.video_thumbnail_url } : null,
  };
}

/** Fila de storefront_categories → StorefrontCategory. bigint llega como texto desde pg. */
export function mapCategory(row) {
  return {
    slug: String(row.slug),
    name: String(row.name),
    sortOrder: Number(row.sort_order) || 0,
    productCount: Number(row.product_count) || 0,
  };
}

/** Enlace de banner: solo https absoluto o ruta relativa; cualquier otro esquema se descarta. */
export function safeLinkUrl(url) {
  const u = nonEmptyString(url)?.trim();
  if (!u) return null;
  if (/^https:\/\//.test(u)) return u;
  if (/^\/[^/]/.test(u)) return u;
  return null;
}

/** Fila de wa_storefront_banners → BannerSummary (contrato v1.2 §banners). */
export function mapBanner(row) {
  const desktop = nonEmptyString(row.desktop_image_url);
  return {
    id: String(row.id),
    placement: row.placement,
    desktopImageUrl: desktop,
    mobileImageUrl: nonEmptyString(row.mobile_image_url),
    linkUrl: safeLinkUrl(row.link_url),
    altText: String(row.alt_text ?? '').trim(),
  };
}

/**
 * Perfil público de la tienda. Email siempre null: no existe columna de consentimiento
 * (show_public_email no existe en el esquema). 
 */
export function mapStoreProfile(b) {
  const ds = b.design_settings && typeof b.design_settings === 'object' ? b.design_settings : {};
  return {
    slug: b.slug,
    name: b.name,
    isDemo: false,
    contact: { whatsapp: nonEmptyString(b.whatsapp), email: null },
    hoursText: nonEmptyString(ds.businessHours)?.trim() || null,
    address: nonEmptyString(b.address),
    socials: {
      instagram: nonEmptyString(b.instagram_url),
      tiktok: nonEmptyString(b.tiktok_url),
      facebook: nonEmptyString(b.facebook_url),
    },
    images: {
      logoUrl: nonEmptyString(b.logo_url) ?? nonEmptyString(ds.logoUrl),
      coverUrl: nonEmptyString(b.cover_image_url) ?? nonEmptyString(ds.coverImageUrl),
    },
    design: {
      primaryColor: nonEmptyString(ds.primaryColor) ?? DEFAULT_PRIMARY_COLOR,
      backgroundColor: nonEmptyString(ds.backgroundColor) ?? DEFAULT_BACKGROUND_COLOR,
      footerText: nonEmptyString(ds.footerText),
    },
    currency: nonEmptyString(b.currency) ?? DEFAULT_CURRENCY,
  };
}
