import { supabase } from '../lib/supabase';

/**
 * Biblioteca de plantillas de catálogo (catalog_templates).
 *
 * Convive con el onboarding automático por rubro (productTemplateService.js +
 * productTemplates.js): NO lo reemplaza. Este servicio cubre la biblioteca
 * administrable por Ventalink (/admin/catalog-templates) y la aplicación
 * manual de una plantilla a un negocio existente.
 *
 * Reglas de applyTemplate:
 *  - Nunca elimina ni modifica productos existentes del negocio: los productos
 *    de la plantilla se agregan al final (sort_order después del máximo actual).
 *  - Las categorías de la plantilla se crean como wa_business_categories solo
 *    si no existen (match por slug); las existentes se respetan.
 *  - Banner y logo solo se aplican si el negocio no tiene imagen propia
 *    (mismas semánticas que el onboarding automático). Con
 *    options.overwriteBranding=true se pisan — el caller debe haber pedido
 *    confirmación explícita al usuario antes.
 *
 * Diseño completo: docs/CATALOG_TEMPLATES_ARCHITECTURE.md
 */

const TEMPLATE_FIELDS =
  'id, name, slug, description, category, preview_image_url, banner_url, logo_url, is_active, rubro_slug, source, created_at, updated_at';

/** Convierte texto a slug limpio (sin acentos, solo a-z0-9-). */
function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

const mapTemplateFromDb = (row) => ({
  id: row?.id,
  name: row?.name,
  slug: row?.slug,
  description: row?.description || '',
  category: row?.category || null,
  previewImageUrl: row?.preview_image_url || null,
  bannerUrl: row?.banner_url || null,
  logoUrl: row?.logo_url || null,
  isActive: row?.is_active === true,
  rubroSlug: row?.rubro_slug || null,
  source: row?.source || 'custom',
  createdAt: row?.created_at,
  updatedAt: row?.updated_at,
});

const mapTemplateProductFromDb = (row) => ({
  id: row?.id,
  templateId: row?.template_id,
  name: row?.name,
  description: row?.description || '',
  price: Number(row?.price ?? 0),
  imageUrl: row?.image_url || null,
  thumbnailUrl: row?.thumbnail_url || row?.image_url || null,
  categoryName: row?.category_name || null,
  sortOrder: row?.sort_order ?? 0,
});

const mapTemplateCategoryFromDb = (row) => ({
  id: row?.id,
  templateId: row?.template_id,
  name: row?.name,
  sortOrder: row?.sort_order ?? 0,
});

/**
 * Lista las plantillas de la biblioteca (sin productos ni categorías).
 * Por defecto solo activas; includeInactive=true para el panel admin
 * (RLS igual oculta las inactivas a usuarios no admin).
 */
export async function getTemplates({ includeInactive = false } = {}) {
  let query = supabase
    ?.from('catalog_templates')
    ?.select(TEMPLATE_FIELDS)
    ?.order('created_at', { ascending: true });
  if (!includeInactive) query = query?.eq('is_active', true);

  const { data, error } = (await query) ?? {};
  if (error) return { data: null, error };
  return { data: (data || []).map(mapTemplateFromDb), error: null };
}

/** Devuelve una plantilla completa: cabecera + categorías + productos. */
export async function getTemplate(templateId) {
  if (!templateId) return { data: null, error: { message: 'templateId es obligatorio' } };

  const [tplRes, catsRes, prodsRes] = await Promise.all([
    supabase?.from('catalog_templates')?.select(TEMPLATE_FIELDS)?.eq('id', templateId)?.single(),
    supabase?.from('catalog_template_categories')?.select('*')?.eq('template_id', templateId)?.order('sort_order', { ascending: true }),
    supabase?.from('catalog_template_products')?.select('*')?.eq('template_id', templateId)?.order('sort_order', { ascending: true }),
  ]);

  const error = tplRes?.error || catsRes?.error || prodsRes?.error || null;
  if (error || !tplRes?.data) return { data: null, error: error || { message: 'Plantilla no encontrada' } };

  return {
    data: {
      ...mapTemplateFromDb(tplRes.data),
      categories: (catsRes?.data || []).map(mapTemplateCategoryFromDb),
      products: (prodsRes?.data || []).map(mapTemplateProductFromDb),
    },
    error: null,
  };
}

/**
 * Devuelve la plantilla de onboarding para un slug de rubro, o null si no hay.
 * Equivalente DB de getTemplateForRubro(rubroSlug) en productTemplates.js;
 * pensada para que el onboarding migre a leer desde la biblioteca (fase 3 del
 * plan) manteniendo el JS hardcodeado como fallback.
 */
export async function getTemplateForRubroSlug(rubroSlug) {
  const normalized = String(rubroSlug || '').trim().toLowerCase();
  if (!normalized) return { data: null, error: null };

  const { data, error } = await supabase
    ?.from('catalog_templates')
    ?.select('id')
    ?.eq('rubro_slug', normalized)
    ?.eq('is_active', true)
    ?.maybeSingle() ?? {};
  if (error || !data?.id) return { data: null, error: error || null };

  return getTemplate(data.id);
}

/**
 * Aplica una plantilla a un negocio: crea categorías y productos, y aplica
 * banner/logo. Aditivo por diseño — nunca elimina productos existentes.
 *
 * @param {string} businessId
 * @param {string} templateId
 * @param {{
 *   applyProducts?: boolean,
 *   applyCategories?: boolean,
 *   applyBranding?: boolean,
 *   overwriteBranding?: boolean, // requiere confirmación explícita del usuario
 * }} [options]
 * @returns {Promise<{ data: {
 *   productsCreated: number,
 *   categoriesCreated: number,
 *   logoApplied: boolean,
 *   bannerApplied: boolean,
 * }|null, error: object|null }>}
 */
export async function applyTemplate(businessId, templateId, options = {}) {
  const {
    applyProducts = true,
    applyCategories = true,
    applyBranding = true,
    overwriteBranding = false,
  } = options;

  if (!businessId || !templateId) {
    return { data: null, error: { message: 'businessId y templateId son obligatorios' } };
  }

  const { data: template, error: templateError } = await getTemplate(templateId);
  if (templateError || !template) {
    return { data: null, error: templateError || { message: 'Plantilla no encontrada' } };
  }
  if (!template.isActive) {
    return { data: null, error: { message: 'La plantilla está desactivada' } };
  }

  const summary = {
    productsCreated: 0,
    categoriesCreated: 0,
    logoApplied: false,
    bannerApplied: false,
  };

  // ── Categorías: crear solo las que no existan (match por slug) ──
  if (applyCategories && template.categories.length > 0) {
    const { data: existingCats, error: existingCatsError } = await supabase
      ?.from('wa_business_categories')
      ?.select('slug, sort_order')
      ?.eq('business_id', businessId) ?? {};
    if (existingCatsError) return { data: null, error: existingCatsError };

    const existingSlugs = new Set((existingCats || []).map((c) => c.slug));
    const maxCatOrder = (existingCats || []).reduce((max, c) => Math.max(max, c.sort_order ?? 0), -1);

    const newCats = template.categories
      .filter((c) => !existingSlugs.has(slugify(c.name)))
      .map((c, index) => ({
        business_id: businessId,
        name: c.name,
        slug: slugify(c.name),
        sort_order: maxCatOrder + 1 + index,
      }));

    if (newCats.length > 0) {
      const { error: catInsertError } = await supabase
        ?.from('wa_business_categories')
        ?.insert(newCats) ?? {};
      if (catInsertError) return { data: null, error: catInsertError };
      summary.categoriesCreated = newCats.length;
    }
  }

  // ── Productos: siempre aditivo, al final del catálogo actual ──
  if (applyProducts && template.products.length > 0) {
    const { data: existingProducts, error: existingError } = await supabase
      ?.from('wa_products')
      ?.select('sort_order')
      ?.eq('business_id', businessId)
      ?.order('sort_order', { ascending: false })
      ?.limit(1) ?? {};
    if (existingError) return { data: null, error: existingError };

    const baseOrder = (existingProducts?.[0]?.sort_order ?? -1) + 1;
    const rows = template.products.map((p, index) => ({
      business_id: businessId,
      name: p.name,
      description: p.description,
      price: p.price,
      image_url: p.imageUrl,
      images: p.imageUrl ? [p.imageUrl] : [],
      card_image_url: p.imageUrl,
      thumbnail_url: p.thumbnailUrl,
      category: p.categoryName,
      status: 'active',
      is_active: true,
      is_draft: false,
      sort_order: baseOrder + index,
    }));

    const { data: inserted, error: insertError } = await supabase
      ?.from('wa_products')
      ?.insert(rows)
      ?.select('id') ?? {};
    if (insertError) return { data: null, error: insertError };
    summary.productsCreated = inserted?.length ?? rows.length;
  }

  // ── Branding: solo si falta, salvo overwriteBranding (confirmado) ──
  if (applyBranding && (template.logoUrl || template.bannerUrl)) {
    const { data: biz, error: bizError } = await supabase
      ?.from('wa_businesses')
      ?.select('id, logo_url, cover_image_url, design_settings')
      ?.eq('id', businessId)
      ?.single() ?? {};
    if (bizError) return { data: null, error: bizError };

    const hasLogo = String(biz?.logo_url || biz?.design_settings?.logoUrl || '').trim() !== '';
    const hasCover = String(
      biz?.cover_image_url || biz?.design_settings?.coverImageUrl || biz?.design_settings?.headerImageUrl || '',
    ).trim() !== '';

    const dbUpdates = {};
    const designUpdates = {};
    if (template.logoUrl && (overwriteBranding || !hasLogo)) {
      dbUpdates.logo_url = template.logoUrl;
      designUpdates.logoUrl = template.logoUrl;
      summary.logoApplied = true;
    }
    if (template.bannerUrl && (overwriteBranding || !hasCover)) {
      dbUpdates.cover_image_url = template.bannerUrl;
      designUpdates.coverImageUrl = template.bannerUrl;
      designUpdates.headerImageUrl = template.bannerUrl;
      summary.bannerApplied = true;
    }

    if (Object.keys(dbUpdates).length > 0) {
      dbUpdates.design_settings = { ...(biz?.design_settings || {}), ...designUpdates };
      const { error: updateError } = await supabase
        ?.from('wa_businesses')
        ?.update(dbUpdates)
        ?.eq('id', businessId) ?? {};
      if (updateError) return { data: null, error: updateError };
    }
  }

  return { data: summary, error: null };
}

/**
 * Duplica una plantilla con sus categorías y productos. La copia nace
 * desactivada (is_active=false), sin rubro_slug (no compite con el onboarding)
 * y con source='custom', lista para editar desde el panel admin.
 */
export async function duplicateTemplate(templateId) {
  const { data: template, error: templateError } = await getTemplate(templateId);
  if (templateError || !template) {
    return { data: null, error: templateError || { message: 'Plantilla no encontrada' } };
  }

  const copyName = `${template.name} (copia)`;
  const baseSlug = slugify(copyName);
  // Sufijo aleatorio corto para no chocar con copias previas del mismo nombre.
  const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 7)}`;

  const { data: created, error: createError } = await supabase
    ?.from('catalog_templates')
    ?.insert({
      name: copyName,
      slug,
      description: template.description,
      category: template.category,
      preview_image_url: template.previewImageUrl,
      banner_url: template.bannerUrl,
      logo_url: template.logoUrl,
      is_active: false,
      rubro_slug: null,
      source: 'custom',
    })
    ?.select(TEMPLATE_FIELDS)
    ?.single() ?? {};
  if (createError || !created?.id) {
    return { data: null, error: createError || { message: 'No se pudo crear la copia' } };
  }

  if (template.categories.length > 0) {
    const { error: catsError } = await supabase
      ?.from('catalog_template_categories')
      ?.insert(template.categories.map((c) => ({
        template_id: created.id,
        name: c.name,
        sort_order: c.sortOrder,
      }))) ?? {};
    if (catsError) return { data: null, error: catsError };
  }

  if (template.products.length > 0) {
    const { error: prodsError } = await supabase
      ?.from('catalog_template_products')
      ?.insert(template.products.map((p) => ({
        template_id: created.id,
        name: p.name,
        description: p.description,
        price: p.price,
        image_url: p.imageUrl,
        thumbnail_url: p.thumbnailUrl,
        category_name: p.categoryName,
        sort_order: p.sortOrder,
      }))) ?? {};
    if (prodsError) return { data: null, error: prodsError };
  }

  return getTemplate(created.id);
}
