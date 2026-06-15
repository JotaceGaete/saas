import { supabase } from '../lib/supabase';
import { getTemplateForRubro } from '../utils/productTemplates';
import { resolveTemplateForOnboarding } from './catalogTemplateService';
import { getFamilyForRubro } from '../utils/rubroFamilyMap';

/**
 * Siembra productos de ejemplo en wa_products según el rubro del negocio.
 *
 * Resolución de plantilla (orden de prioridad):
 *  1. catalog_templates DB: rubro_slug exacto, is_active = true
 *  2. catalog_templates DB: family_slug (familia del rubro), sin rubro específico, is_active = true
 *  3. catalog_templates DB: is_universal = true, is_active = true
 *  4. productTemplates.js hardcodeado (fallback legacy)
 *
 * Solo inserta si el negocio no tiene productos reales. Los borradores
 * automáticos del editor (is_draft=true) no cuentan como reales.
 * Devuelve `branding` para que el caller lo aplique solo si el negocio
 * no tiene imágenes propias.
 *
 * @param {{ businessId: string, rubroSlug: string }} params
 */
export async function seedTemplateProductsIfEmpty({ businessId, rubroSlug }) {
  if (!businessId || !rubroSlug) {
    return {
      created: 0, categoriesCreated: 0, skipped: true,
      reason: 'missing-business-or-rubro-slug', source: 'none',
      error: null, templateKey: null, branding: null,
    };
  }

  // ── Chequeo de productos existentes (antes del lookup de plantilla) ──────────
  const { data: existing, error: existingError } = await supabase
    ?.from('wa_products')
    ?.select('id, is_draft')
    ?.eq('business_id', businessId)
    ?.limit(50);
  if (existingError) {
    console.error('[templates] error consultando productos existentes:', existingError);
    return {
      created: 0, categoriesCreated: 0, skipped: true, reason: 'count-error',
      error: existingError, templateKey: null, branding: null,
    };
  }
  const realProducts = (existing || []).filter((p) => p?.is_draft !== true);
  if (realProducts.length > 0) {
    console.log('[templates] skipped: negocio ya tiene', realProducts.length, 'productos reales');
    return {
      created: 0, categoriesCreated: 0, skipped: true, reason: 'business-has-products', source: 'none',
      error: null, templateKey: null, branding: null,
    };
  }

  // ── 1-3. Intentar plantilla desde catalog_templates (DB): rubro → familia → universal ──
  try {
    const familySlug = getFamilyForRubro(rubroSlug);
    console.log('[templates] rubro:', rubroSlug, '| familia:', familySlug ?? 'sin familia');
    const { data: dbTemplate, source: dbSource, error: dbError } = await resolveTemplateForOnboarding(rubroSlug, familySlug);
    if (!dbError && dbTemplate?.isActive && (dbTemplate.products?.length ?? 0) > 0) {
      console.log('[templates] template source:', dbSource, '| nombre:', dbTemplate.name);
      const result = await _seedFromDbTemplate({ businessId, dbTemplate });
      console.log('[templates] products seeded:', result.created);
      return { ...result, source: dbSource };
    }
    if (dbError) {
      console.warn('[templates] error consultando catalog_templates (continúa con fallback JS):', dbError);
    } else {
      console.log('[templates] sin plantilla DB para rubro/familia/universal — intentando fallback JS');
    }
  } catch (dbLookupError) {
    console.warn('[templates] excepción en lookup DB (continúa con fallback JS):', dbLookupError);
  }

  // ── 2. Fallback: plantilla JS hardcodeada ────────────────────────────────────
  const template = getTemplateForRubro(rubroSlug);
  if (!template || template.products.length === 0) {
    console.log('[templates] template source: none — sin plantilla para rubro_slug:', rubroSlug);
    return {
      created: 0, categoriesCreated: 0, skipped: true,
      reason: `no-template-for-rubro:${rubroSlug}`, source: 'none',
      error: null, templateKey: null, branding: null,
    };
  }

  console.log('[templates] template source: js-fallback | key:', template.templateKey);
  const result = await _seedFromJsTemplate({ businessId, template });
  console.log('[templates] products seeded:', result.created);
  return { ...result, source: 'js-fallback' };
}

// ─── Seeding desde plantilla DB (catalog_template_products) ──────────────────

async function _seedFromDbTemplate({ businessId, dbTemplate }) {
  const branding = {
    logoUrl: dbTemplate.logoUrl || null,
    coverImageUrl: dbTemplate.bannerUrl || null,
    previewImageUrl: dbTemplate.previewImageUrl || null,
  };

  // Categorías: crear solo las que no existan (match por slug generado del nombre)
  let categoriesCreated = 0;
  const categoryNameByNormalizedName = {};

  if ((dbTemplate.categories || []).length > 0) {
    try {
      const { data: existingCats, error: catsError } = await supabase
        ?.from('wa_business_categories')
        ?.select('slug, name, sort_order')
        ?.eq('business_id', businessId);
      if (catsError) throw catsError;

      const existingBySlug = new Map((existingCats || []).map((c) => [c.slug, c]));
      let nextOrder = (existingCats || []).reduce((max, c) => Math.max(max, c.sort_order ?? 0), -1) + 1;

      const newCats = [];
      for (const cat of dbTemplate.categories) {
        const slug = _slugify(cat.name);
        const found = existingBySlug.get(slug);
        if (found) {
          categoryNameByNormalizedName[cat.name] = found.name;
        } else {
          newCats.push({ business_id: businessId, name: cat.name, slug, sort_order: nextOrder++ });
          categoryNameByNormalizedName[cat.name] = cat.name;
        }
      }
      if (newCats.length > 0) {
        const { error: catInsertError } = await supabase
          ?.from('wa_business_categories')
          ?.insert(newCats);
        if (catInsertError) throw catInsertError;
        categoriesCreated = newCats.length;
      }
    } catch (catError) {
      console.error('[templates] error sembrando categorías DB (continúa):', catError);
    }
  }

  // Productos
  const rows = dbTemplate.products.map((p, index) => ({
    business_id: businessId,
    name: p.name,
    description: p.description || null,
    price: p.price,
    category: p.categoryName || null,
    image_url: p.imageUrl,
    images: p.imageUrl ? [p.imageUrl] : [],
    card_image_url: p.imageUrl,
    thumbnail_url: p.thumbnailUrl || p.imageUrl,
    status: 'active',
    is_active: true,
    is_draft: false,
    sort_order: index,
  }));

  const { data, error } = await supabase
    ?.from('wa_products')
    ?.insert(rows)
    ?.select('id');
  if (error) {
    console.error('[templates] insert error (DB template):', error);
    return {
      created: 0, categoriesCreated, skipped: false, reason: 'insert-error',
      error, templateKey: dbTemplate.slug, branding,
    };
  }

  return {
    created: data?.length ?? rows.length, categoriesCreated, skipped: false, reason: null,
    error: null, templateKey: dbTemplate.slug, branding,
  };
}

// ─── Seeding desde plantilla JS legacy ───────────────────────────────────────

async function _seedFromJsTemplate({ businessId, template }) {
  const templateKey = template.templateKey;
  const branding = {
    logoUrl: template.logoUrl || null,
    coverImageUrl: template.coverImageUrl || null,
    previewImageUrl: null,
  };

  let categoriesCreated = 0;
  const categoryNameBySlug = Object.fromEntries(
    (template.categories || []).map((c) => [c.slug, c.name]),
  );

  if ((template.categories || []).length > 0) {
    try {
      const { data: existingCats, error: catsError } = await supabase
        ?.from('wa_business_categories')
        ?.select('slug, name, sort_order')
        ?.eq('business_id', businessId);
      if (catsError) throw catsError;

      const existingBySlug = new Map((existingCats || []).map((c) => [c.slug, c]));
      let nextOrder = (existingCats || []).reduce((max, c) => Math.max(max, c.sort_order ?? 0), -1) + 1;

      const newCats = [];
      for (const cat of template.categories) {
        const found = existingBySlug.get(cat.slug);
        if (found) {
          categoryNameBySlug[cat.slug] = found.name;
        } else {
          newCats.push({ business_id: businessId, name: cat.name, slug: cat.slug, sort_order: nextOrder++ });
        }
      }
      if (newCats.length > 0) {
        const { error: catInsertError } = await supabase
          ?.from('wa_business_categories')
          ?.insert(newCats);
        if (catInsertError) throw catInsertError;
        categoriesCreated = newCats.length;
      }
      console.log('[templates] categorías: creadas', categoriesCreated, '| reutilizadas', existingBySlug.size);
    } catch (catError) {
      console.error('[templates] error sembrando categorías JS (continúa):', catError);
    }
  }

  const rows = template.products.map((p, index) => ({
    business_id: businessId,
    name: p.name,
    description: p.description,
    price: p.price,
    category: (p.categorySlug && categoryNameBySlug[p.categorySlug]) || null,
    image_url: p.cardImageUrl,
    images: [p.cardImageUrl],
    card_image_url: p.cardImageUrl,
    thumbnail_url: p.thumbnailUrl || p.cardImageUrl,
    status: 'active',
    is_active: true,
    is_draft: false,
    sort_order: index,
  }));

  const { data, error } = await supabase
    ?.from('wa_products')
    ?.insert(rows)
    ?.select('id');
  if (error) {
    console.error('[templates] insert error (JS template):', error);
    return {
      created: 0, categoriesCreated, skipped: false, reason: 'insert-error',
      error, templateKey, branding,
    };
  }

  return {
    created: data?.length ?? rows.length, categoriesCreated, skipped: false, reason: null,
    error: null, templateKey, branding,
  };
}

// ─── Util ────────────────────────────────────────────────────────────────────

function _slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}
