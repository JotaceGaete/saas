import { supabase } from '../lib/supabase';
import { getFamilyForRubro } from '../utils/rubroFamilyMap';

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
  'id, name, slug, description, category, preview_image_url, banner_url, logo_url, is_active, rubro_slug, family_slug, source, primary_color, secondary_color, theme, catalog_layout, button_style, created_at, updated_at';

/** Presets de fondo que consume el catálogo público (catalogTheme.js). */
const VALID_TEMPLATE_THEMES = ['light', 'dark', 'pastel'];
const isValidHexColor = (value) => /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(String(value || '').trim());

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
  familySlug: row?.family_slug || null,
  source: row?.source || 'custom',
  primaryColor: row?.primary_color || null,
  secondaryColor: row?.secondary_color || null,
  theme: row?.theme || null,
  catalogLayout: row?.catalog_layout || null,
  buttonStyle: row?.button_style || null,
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
 * Devuelve la plantilla de onboarding para un slug de rubro usando 3 niveles:
 *   1. Rubro exacto  — catalog_templates.rubro_slug = rubroSlug (prioridad máxima)
 *   2. Familia       — family_slug = RUBRO_FAMILY_MAP[rubroSlug], sin rubro_slug
 *   3. Universal     — family_slug = 'universal', sin rubro_slug
 *
 * Emite logs de diagnóstico en desarrollo ([templates:resolve]).
 */
export async function getTemplateForRubroSlug(rubroSlug) {
  const normalized = String(rubroSlug || '').trim().toLowerCase();
  if (!normalized) return { data: null, error: null };

  // ── Nivel 1: rubro exacto ────────────────────────────────────────────────
  const { data: exactRow, error: exactError } = (await supabase
    ?.from('catalog_templates')
    ?.select('id')
    ?.eq('rubro_slug', normalized)
    ?.eq('is_active', true)
    ?.maybeSingle()) ?? {};
  if (exactError) return { data: null, error: exactError };
  if (exactRow?.id) {
    if (import.meta.env.DEV) console.log('[templates:resolve]', { rubroSlug: normalized, level: 'exact', templateId: exactRow.id });
    return getTemplate(exactRow.id);
  }

  // ── Nivel 2: familia ─────────────────────────────────────────────────────
  const family = getFamilyForRubro(normalized);
  if (family) {
    const { data: familyRow, error: familyError } = (await supabase
      ?.from('catalog_templates')
      ?.select('id')
      ?.eq('family_slug', family)
      ?.is('rubro_slug', null)
      ?.eq('is_active', true)
      ?.maybeSingle()) ?? {};
    if (familyError) return { data: null, error: familyError };
    if (familyRow?.id) {
      if (import.meta.env.DEV) console.log('[templates:resolve]', { rubroSlug: normalized, level: 'family', family, templateId: familyRow.id });
      return getTemplate(familyRow.id);
    }
  }

  // ── Nivel 3: universal ───────────────────────────────────────────────────
  const { data: universalRow, error: universalError } = (await supabase
    ?.from('catalog_templates')
    ?.select('id')
    ?.eq('family_slug', 'universal')
    ?.is('rubro_slug', null)
    ?.eq('is_active', true)
    ?.maybeSingle()) ?? {};
  if (universalError) return { data: null, error: universalError };
  if (universalRow?.id) {
    if (import.meta.env.DEV) console.log('[templates:resolve]', { rubroSlug: normalized, level: 'universal', family: family || null, templateId: universalRow.id });
    return getTemplate(universalRow.id);
  }

  if (import.meta.env.DEV) console.log('[templates:resolve]', { rubroSlug: normalized, level: 'skipped', family: family || null });
  return { data: null, error: null };
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
 *   designApplied: boolean,
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
    designApplied: false,
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

  // ── Branding + identidad visual: solo si falta / sigue en defaults, salvo
  // overwriteBranding (confirmado por el usuario) ──
  const hasVisualIdentity = !!(template.primaryColor || template.secondaryColor || template.theme || template.catalogLayout);
  if (applyBranding && (template.logoUrl || template.bannerUrl || hasVisualIdentity)) {
    const { data: biz, error: bizError } = await supabase
      ?.from('wa_businesses')
      ?.select('id, logo_url, cover_image_url, design_settings')
      ?.eq('id', businessId)
      ?.single() ?? {};
    if (bizError) return { data: null, error: bizError };

    const design = biz?.design_settings || {};
    const hasLogo = String(biz?.logo_url || design?.logoUrl || '').trim() !== '';
    const hasCover = String(
      biz?.cover_image_url || design?.coverImageUrl || design?.headerImageUrl || '',
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

    // Identidad visual: cada campo se aplica solo si el negocio sigue en su
    // valor por defecto — un color/tema elegido por el usuario nunca se pisa.
    // Defaults reales: primaryColor '#7C3AED' (pre-llenado de /design) o
    // '#25D366' (fallback de resolveCatalogTheme); template 'light';
    // backgroundColor vacío; catalogLayout 'list'.
    const currentPrimary = String(design?.primaryColor || '').trim().toUpperCase();
    const primaryIsDefault = !isValidHexColor(currentPrimary) || currentPrimary === '#7C3AED' || currentPrimary === '#25D366';
    if (template.primaryColor && (overwriteBranding || primaryIsDefault)) {
      designUpdates.primaryColor = template.primaryColor;
      summary.designApplied = true;
    }

    const currentTheme = String(design?.template || '').trim().toLowerCase();
    if (template.theme && (overwriteBranding || !currentTheme || currentTheme === 'light')) {
      designUpdates.template = template.theme;
      summary.designApplied = true;
    }

    if (template.secondaryColor && (overwriteBranding || !isValidHexColor(design?.backgroundColor))) {
      designUpdates.backgroundColor = template.secondaryColor;
      summary.designApplied = true;
    }

    const currentLayout = String(design?.catalogLayout || '').trim();
    if (template.catalogLayout && (overwriteBranding || !currentLayout || currentLayout === 'list')) {
      designUpdates.catalogLayout = template.catalogLayout;
      summary.designApplied = true;
    }

    if (Object.keys(dbUpdates).length > 0 || Object.keys(designUpdates).length > 0) {
      dbUpdates.design_settings = { ...design, ...designUpdates };
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
      primary_color: template.primaryColor,
      secondary_color: template.secondaryColor,
      theme: template.theme,
      catalog_layout: template.catalogLayout,
      button_style: template.buttonStyle,
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

// ─── CRUD del panel admin (/admin/catalog-templates) ─────────────────────────

/**
 * Verifica que no exista OTRA plantilla activa con el mismo rubro_slug.
 * El índice único parcial (catalog_templates_rubro_active_unique) lo garantiza
 * a nivel DB; este chequeo entrega un error legible antes del insert/update.
 */
async function findActiveRubroConflict(rubroSlug, excludeTemplateId = null) {
  const normalized = String(rubroSlug || '').trim().toLowerCase();
  if (!normalized) return null;
  let query = supabase
    ?.from('catalog_templates')
    ?.select('id, name')
    ?.eq('rubro_slug', normalized)
    ?.eq('is_active', true)
    ?.limit(1);
  if (excludeTemplateId) query = query?.neq('id', excludeTemplateId);
  const { data } = (await query) ?? {};
  return data?.[0] || null;
}

/**
 * Verifica que no exista OTRA plantilla activa con el mismo family_slug
 * Y sin rubro_slug (índice catalog_templates_family_active_unique).
 */
async function findActiveFamilyConflict(familySlug, excludeTemplateId = null) {
  const normalized = String(familySlug || '').trim().toLowerCase();
  if (!normalized) return null;
  let query = supabase
    ?.from('catalog_templates')
    ?.select('id, name')
    ?.eq('family_slug', normalized)
    ?.is('rubro_slug', null)
    ?.eq('is_active', true)
    ?.limit(1);
  if (excludeTemplateId) query = query?.neq('id', excludeTemplateId);
  const { data } = (await query) ?? {};
  return data?.[0] || null;
}

function buildTemplateDbPayload(input = {}) {
  const payload = {};
  if (input.name !== undefined) payload.name = String(input.name || '').trim();
  if (input.description !== undefined) payload.description = String(input.description || '').trim() || null;
  if (input.category !== undefined) payload.category = String(input.category || '').trim() || null;
  if (input.previewImageUrl !== undefined) payload.preview_image_url = String(input.previewImageUrl || '').trim() || null;
  if (input.bannerUrl !== undefined) payload.banner_url = String(input.bannerUrl || '').trim() || null;
  if (input.logoUrl !== undefined) payload.logo_url = String(input.logoUrl || '').trim() || null;
  if (input.isActive !== undefined) payload.is_active = input.isActive === true;
  if (input.rubroSlug !== undefined) {
    payload.rubro_slug = String(input.rubroSlug || '').trim().toLowerCase() || null;
  }
  if (input.familySlug !== undefined) {
    payload.family_slug = String(input.familySlug || '').trim().toLowerCase() || null;
  }
  if (input.primaryColor !== undefined) {
    payload.primary_color = isValidHexColor(input.primaryColor) ? String(input.primaryColor).trim() : null;
  }
  if (input.secondaryColor !== undefined) {
    payload.secondary_color = isValidHexColor(input.secondaryColor) ? String(input.secondaryColor).trim() : null;
  }
  if (input.theme !== undefined) {
    const theme = String(input.theme || '').trim().toLowerCase();
    payload.theme = VALID_TEMPLATE_THEMES.includes(theme) ? theme : null;
  }
  if (input.catalogLayout !== undefined) payload.catalog_layout = String(input.catalogLayout || '').trim() || null;
  if (input.buttonStyle !== undefined) payload.button_style = String(input.buttonStyle || '').trim() || null;
  return payload;
}

const RUBRO_CONFLICT_MESSAGE =
  'Ya existe otra plantilla activa asociada a ese rubro. Desactívala o quítale el rubro primero.';
const FAMILY_CONFLICT_MESSAGE =
  'Ya existe otra plantilla activa de esa familia sin rubro específico. Desactívala o quítale la familia primero.';

/** Crea una plantilla (cabecera). Las plantillas del panel nacen source='custom'. */
export async function createTemplate(input = {}) {
  const name = String(input?.name || '').trim();
  if (!name) return { data: null, error: { message: 'El nombre de la plantilla es obligatorio' } };

  const payload = buildTemplateDbPayload({ isActive: false, ...input, name });
  if (payload.is_active && payload.rubro_slug) {
    const conflict = await findActiveRubroConflict(payload.rubro_slug);
    if (conflict) return { data: null, error: { message: RUBRO_CONFLICT_MESSAGE } };
  }
  if (payload.is_active && payload.family_slug && !payload.rubro_slug) {
    const conflict = await findActiveFamilyConflict(payload.family_slug);
    if (conflict) return { data: null, error: { message: FAMILY_CONFLICT_MESSAGE } };
  }

  const baseSlug = slugify(name) || 'plantilla';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${Math.random().toString(36).slice(2, 7)}`;
    const { data, error } = await supabase
      ?.from('catalog_templates')
      ?.insert({ ...payload, slug, source: 'custom' })
      ?.select(TEMPLATE_FIELDS)
      ?.single() ?? {};
    if (!error) return { data: mapTemplateFromDb(data), error: null };
    if (error?.code !== '23505') return { data: null, error };
    if (String(error?.message || '').includes('rubro')) {
      return { data: null, error: { message: RUBRO_CONFLICT_MESSAGE } };
    }
  }
  return { data: null, error: { message: 'No se pudo generar un identificador único para la plantilla' } };
}

/** Actualiza la cabecera de una plantilla. */
export async function updateTemplate(templateId, updates = {}) {
  if (!templateId) return { data: null, error: { message: 'templateId es obligatorio' } };

  const payload = buildTemplateDbPayload(updates);
  if (payload.name !== undefined && !payload.name) {
    return { data: null, error: { message: 'El nombre de la plantilla es obligatorio' } };
  }
  if (Object.keys(payload).length === 0) return getTemplate(templateId);

  // Resolver estado/rubro finales para validar el conflicto de rubro activo.
  const { data: current, error: currentError } = await supabase
    ?.from('catalog_templates')
    ?.select('id, is_active, rubro_slug, family_slug')
    ?.eq('id', templateId)
    ?.single() ?? {};
  if (currentError || !current) {
    return { data: null, error: currentError || { message: 'Plantilla no encontrada' } };
  }
  const finalActive = payload.is_active !== undefined ? payload.is_active : current.is_active;
  const finalRubro = payload.rubro_slug !== undefined ? payload.rubro_slug : current.rubro_slug;
  const finalFamily = payload.family_slug !== undefined ? payload.family_slug : current.family_slug;
  if (finalActive && finalRubro) {
    const conflict = await findActiveRubroConflict(finalRubro, templateId);
    if (conflict) return { data: null, error: { message: RUBRO_CONFLICT_MESSAGE } };
  }
  if (finalActive && finalFamily && !finalRubro) {
    const conflict = await findActiveFamilyConflict(finalFamily, templateId);
    if (conflict) return { data: null, error: { message: FAMILY_CONFLICT_MESSAGE } };
  }

  const { data, error } = await supabase
    ?.from('catalog_templates')
    ?.update(payload)
    ?.eq('id', templateId)
    ?.select(TEMPLATE_FIELDS)
    ?.single() ?? {};
  if (error) {
    if (error?.code === '23505' && String(error?.message || '').includes('family')) {
      return { data: null, error: { message: FAMILY_CONFLICT_MESSAGE } };
    }
    if (error?.code === '23505') return { data: null, error: { message: RUBRO_CONFLICT_MESSAGE } };
    return { data: null, error };
  }
  return { data: mapTemplateFromDb(data), error: null };
}

/** Activa o desactiva una plantilla (valida el conflicto de rubro al activar). */
export async function toggleTemplateActive(templateId, isActive) {
  return updateTemplate(templateId, { isActive: isActive === true });
}

/**
 * Elimina una plantilla custom (cascade borra categorías y productos), o solo
 * desactiva si es source='system' (respaldan el onboarding hardcodeado).
 * El caller debe haber pedido confirmación explícita antes.
 */
export async function deleteOrDeactivateTemplate(templateId) {
  if (!templateId) return { data: null, error: { message: 'templateId es obligatorio' } };

  const { data: current, error: currentError } = await supabase
    ?.from('catalog_templates')
    ?.select('id, source')
    ?.eq('id', templateId)
    ?.single() ?? {};
  if (currentError || !current) {
    return { data: null, error: currentError || { message: 'Plantilla no encontrada' } };
  }

  if (current.source === 'system') {
    const result = await toggleTemplateActive(templateId, false);
    if (result.error) return result;
    return { data: { deleted: false, deactivated: true }, error: null };
  }

  const { error } = await supabase
    ?.from('catalog_templates')
    ?.delete()
    ?.eq('id', templateId) ?? {};
  if (error) return { data: null, error };
  return { data: { deleted: true, deactivated: false }, error: null };
}

/**
 * Sincroniza las categorías de una plantilla con la lista entregada:
 * actualiza las que traen id, inserta las nuevas y elimina las que ya no
 * están (el caller confirma las eliminaciones en la UI antes de llamar).
 *
 * @param {string} templateId
 * @param {Array<{ id?: string, name: string, sortOrder?: number }>} categories
 */
export async function upsertTemplateCategories(templateId, categories = []) {
  if (!templateId) return { data: null, error: { message: 'templateId es obligatorio' } };

  const cleaned = (categories || [])
    .map((c, index) => ({ id: c?.id || null, name: String(c?.name || '').trim(), sort_order: c?.sortOrder ?? index }))
    .filter((c) => c.name);

  const { data: existing, error: existingError } = await supabase
    ?.from('catalog_template_categories')
    ?.select('id')
    ?.eq('template_id', templateId) ?? {};
  if (existingError) return { data: null, error: existingError };

  const keptIds = new Set(cleaned.filter((c) => c.id).map((c) => c.id));
  const toDelete = (existing || []).map((r) => r.id).filter((id) => !keptIds.has(id));

  if (toDelete.length > 0) {
    const { error } = await supabase
      ?.from('catalog_template_categories')?.delete()?.in('id', toDelete) ?? {};
    if (error) return { data: null, error };
  }
  for (const cat of cleaned.filter((c) => c.id)) {
    const { error } = await supabase
      ?.from('catalog_template_categories')
      ?.update({ name: cat.name, sort_order: cat.sort_order })
      ?.eq('id', cat.id)?.eq('template_id', templateId) ?? {};
    if (error) return { data: null, error };
  }
  const toInsert = cleaned.filter((c) => !c.id).map((c) => ({
    template_id: templateId, name: c.name, sort_order: c.sort_order,
  }));
  if (toInsert.length > 0) {
    const { error } = await supabase
      ?.from('catalog_template_categories')?.insert(toInsert) ?? {};
    if (error) return { data: null, error };
  }

  return getTemplate(templateId);
}

/**
 * Sincroniza los productos de una plantilla (misma semántica diff que
 * upsertTemplateCategories: update por id, insert nuevos, delete ausentes
 * — las eliminaciones llegan ya confirmadas por el usuario).
 *
 * @param {string} templateId
 * @param {Array<{ id?: string, name: string, description?: string, price?: number,
 *   imageUrl?: string, thumbnailUrl?: string, categoryName?: string, sortOrder?: number }>} products
 */
export async function upsertTemplateProducts(templateId, products = []) {
  if (!templateId) return { data: null, error: { message: 'templateId es obligatorio' } };

  const cleaned = (products || [])
    .map((p, index) => ({
      id: p?.id || null,
      name: String(p?.name || '').trim(),
      description: String(p?.description || '').trim() || null,
      price: Number.isFinite(Number(p?.price)) ? Number(p.price) : 0,
      image_url: String(p?.imageUrl || '').trim() || null,
      thumbnail_url: String(p?.thumbnailUrl || p?.imageUrl || '').trim() || null,
      category_name: String(p?.categoryName || '').trim() || null,
      sort_order: p?.sortOrder ?? index,
    }))
    .filter((p) => p.name);

  const { data: existing, error: existingError } = await supabase
    ?.from('catalog_template_products')
    ?.select('id')
    ?.eq('template_id', templateId) ?? {};
  if (existingError) return { data: null, error: existingError };

  const keptIds = new Set(cleaned.filter((p) => p.id).map((p) => p.id));
  const toDelete = (existing || []).map((r) => r.id).filter((id) => !keptIds.has(id));

  if (toDelete.length > 0) {
    const { error } = await supabase
      ?.from('catalog_template_products')?.delete()?.in('id', toDelete) ?? {};
    if (error) return { data: null, error };
  }
  for (const prod of cleaned.filter((p) => p.id)) {
    const { id, ...fields } = prod;
    const { error } = await supabase
      ?.from('catalog_template_products')
      ?.update(fields)
      ?.eq('id', id)?.eq('template_id', templateId) ?? {};
    if (error) return { data: null, error };
  }
  const toInsert = cleaned.filter((p) => !p.id).map(({ id: _id, ...fields }) => ({
    template_id: templateId, ...fields,
  }));
  if (toInsert.length > 0) {
    const { error } = await supabase
      ?.from('catalog_template_products')?.insert(toInsert) ?? {};
    if (error) return { data: null, error };
  }

  return getTemplate(templateId);
}
