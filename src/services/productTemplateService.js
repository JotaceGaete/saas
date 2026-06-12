import { supabase } from '../lib/supabase';
import { getTemplateForRubro } from '../utils/productTemplates';
import { getTemplateForRubroSlug } from './catalogTemplateService';
import { getFamilyForRubro } from '../utils/rubroFamilyMap';

/**
 * Siembra productos de ejemplo en wa_products según el rubro del negocio.
 *
 * Automático e invisible: se llama al guardar el rubro principal en
 * /business-configuration. Solo inserta si el negocio no tiene productos
 * reales y existe un template para el rubro. Los borradores automáticos del
 * editor (is_draft=true, invisibles para el usuario) no cuentan como
 * productos reales y no bloquean la siembra. Los productos quedan
 * is_active=true y status='active' para que aparezcan de inmediato en el
 * catálogo; el usuario los edita después desde /product-editor.
 *
 * Junto con los productos siembra las categorías del template como
 * wa_business_categories del negocio (reutilizando por slug las que ya
 * existan, nunca duplicando) y asocia cada producto a su categoría vía
 * wa_products.category (nombre, que es como el catálogo público las agrupa).
 *
 * Además del resultado de la siembra devuelve el branding del template
 * (logo y cover prediseñados) para que el caller lo aplique al negocio
 * solo si este no tiene imágenes propias.
 *
 * @param {{ businessId: string, rubroSlug: string }} params
 * @returns {Promise<{
 *   created: number,
 *   categoriesCreated: number,
 *   skipped: boolean,
 *   reason: string|null,
 *   error: object|null,
 *   templateKey: string|null,
 *   branding: { logoUrl: string|null, coverImageUrl: string|null }|null,
 * }>}
 */
/** Genera slug simple (sin librerías externas, para categorías DB). */
function slugifySimple(value) {
  return String(value || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim()
    .replace(/\s+/g, '-').replace(/-+/g, '-') || 'categoria';
}

/**
 * Siembra desde una plantilla de la biblioteca DB (catalog_templates).
 * Las categorías del template son por nombre (sin slug); se genera slug
 * de manera local para wa_business_categories y se deduplica por nombre.
 */
async function seedFromDbTemplate({ businessId, template }) {
  const branding = { logoUrl: template.logoUrl || null, coverImageUrl: template.bannerUrl || null };
  const templateKey = template.id;

  const { data: existing, error: existingError } = await supabase
    ?.from('wa_products')?.select('id, is_draft')?.eq('business_id', businessId)?.limit(50);
  if (existingError) return { created: 0, categoriesCreated: 0, skipped: true, reason: 'count-error', error: existingError, templateKey, branding };

  const realProducts = (existing || []).filter((p) => p?.is_draft !== true);
  if (realProducts.length > 0) return { created: 0, categoriesCreated: 0, skipped: true, reason: 'business-has-products', error: null, templateKey, branding };

  let categoriesCreated = 0;
  const resolvedCategoryName = {};

  if ((template.categories || []).length > 0) {
    try {
      const { data: existingCats, error: catsError } = await supabase
        ?.from('wa_business_categories')?.select('slug, name, sort_order')?.eq('business_id', businessId);
      if (catsError) throw catsError;

      const existingByNameLower = new Map((existingCats || []).map((c) => [c.name.toLowerCase(), c.name]));
      let nextOrder = (existingCats || []).reduce((max, c) => Math.max(max, c.sort_order ?? 0), -1) + 1;
      const newCats = [];

      for (const cat of template.categories) {
        const found = existingByNameLower.get(cat.name.toLowerCase());
        resolvedCategoryName[cat.name] = found || cat.name;
        if (!found) newCats.push({ business_id: businessId, name: cat.name, slug: slugifySimple(cat.name), sort_order: nextOrder++ });
      }

      if (newCats.length > 0) {
        const { error: catInsertError } = await supabase?.from('wa_business_categories')?.insert(newCats);
        if (catInsertError) throw catInsertError;
        categoriesCreated = newCats.length;
      }
      if (import.meta.env.DEV) console.log('[templates] categorías DB: creadas', categoriesCreated, '| reutilizadas', Object.keys(resolvedCategoryName).length - categoriesCreated);
    } catch (catError) {
      console.error('[templates] error sembrando categorías (DB template):', catError);
    }
  }

  const rows = (template.products || []).map((p, index) => {
    const catName = p.categoryName ? (resolvedCategoryName[p.categoryName] || p.categoryName) : null;
    return {
      business_id: businessId, name: p.name, description: p.description, price: p.price,
      category: catName, image_url: p.imageUrl || null,
      images: p.imageUrl ? [p.imageUrl] : [], card_image_url: p.imageUrl || null,
      thumbnail_url: p.imageUrl || null, status: 'active', is_active: true, is_draft: false, sort_order: index,
    };
  });

  const { data, error } = await supabase?.from('wa_products')?.insert(rows)?.select('id');
  if (error) { console.error('[templates] insert error (DB template):', error); return { created: 0, categoriesCreated, skipped: false, reason: 'insert-error', error, templateKey, branding }; }
  return { created: data?.length ?? rows.length, categoriesCreated, skipped: false, reason: null, error: null, templateKey, branding };
}

export async function seedTemplateProductsIfEmpty({ businessId, rubroSlug }) {
  if (!businessId || !rubroSlug) {
    return {
      created: 0, categoriesCreated: 0, skipped: true, reason: 'missing-business-or-rubro-slug',
      error: null, templateKey: null, branding: null,
    };
  }

  // ── Nivel DB (3 niveles: rubro exacto → familia → universal) ─────────────
  // getTemplateForRubroSlug emite sus propios logs de diagnóstico en dev.
  const { data: dbTemplate } = await getTemplateForRubroSlug(rubroSlug);
  if (dbTemplate && (dbTemplate.products || []).length > 0) {
    if (import.meta.env.DEV) {
      const family = getFamilyForRubro(rubroSlug);
      console.log('[templates] seed source=db', { rubroSlug, family, templateId: dbTemplate.id, templateName: dbTemplate.name });
    }
    return seedFromDbTemplate({ businessId, template: dbTemplate });
  }

  // ── Fallback JS (templates hardcodeados para 'ropa' y 'comida-y-bebidas') ─
  const jsTemplate = getTemplateForRubro(rubroSlug);
  if (!jsTemplate || jsTemplate.products.length === 0) {
    if (import.meta.env.DEV) {
      const family = getFamilyForRubro(rubroSlug);
      console.log('[templates:resolve]', { rubroSlug, level: 'skipped', family: family || null, reason: 'no-db-no-js' });
    }
    return {
      created: 0, categoriesCreated: 0, skipped: true, reason: `no-template-for-rubro:${rubroSlug}`,
      error: null, templateKey: null, branding: null,
    };
  }

  if (import.meta.env.DEV) console.log('[templates] seed source=js', { rubroSlug, templateKey: jsTemplate.templateKey });

  const templateKey = jsTemplate.templateKey;
  const branding = { logoUrl: jsTemplate.logoUrl || null, coverImageUrl: jsTemplate.coverImageUrl || null };

  const { data: existing, error: existingError } = await supabase
    ?.from('wa_products')?.select('id, name, status, is_active, is_draft')?.eq('business_id', businessId)?.limit(50);
  if (existingError) {
    console.error('[templates] error consultando productos existentes:', existingError);
    return { created: 0, categoriesCreated: 0, skipped: true, reason: 'count-error', error: existingError, templateKey, branding };
  }

  const realProducts = (existing || []).filter((p) => p?.is_draft !== true);
  if (import.meta.env.DEV) console.log('[templates] productos existentes:', existing?.length ?? 0, '| reales (no draft):', realProducts.length);
  if (realProducts.length > 0) {
    return { created: 0, categoriesCreated: 0, skipped: true, reason: 'business-has-products', error: null, templateKey, branding };
  }

  // ── Categorías del template JS (dedup por slug) ───────────────────────────
  let categoriesCreated = 0;
  const categoryNameBySlug = Object.fromEntries((jsTemplate.categories || []).map((c) => [c.slug, c.name]));
  if ((jsTemplate.categories || []).length > 0) {
    try {
      const { data: existingCats, error: catsError } = await supabase
        ?.from('wa_business_categories')?.select('slug, name, sort_order')?.eq('business_id', businessId);
      if (catsError) throw catsError;

      const existingBySlug = new Map((existingCats || []).map((c) => [c.slug, c]));
      let nextOrder = (existingCats || []).reduce((max, c) => Math.max(max, c.sort_order ?? 0), -1) + 1;
      const newCats = [];

      for (const cat of jsTemplate.categories) {
        const found = existingBySlug.get(cat.slug);
        if (found) { categoryNameBySlug[cat.slug] = found.name; }
        else { newCats.push({ business_id: businessId, name: cat.name, slug: cat.slug, sort_order: nextOrder++ }); }
      }
      if (newCats.length > 0) {
        const { error: catInsertError } = await supabase?.from('wa_business_categories')?.insert(newCats);
        if (catInsertError) throw catInsertError;
        categoriesCreated = newCats.length;
      }
      if (import.meta.env.DEV) console.log('[templates] categorías JS: creadas', categoriesCreated, '| reutilizadas', existingBySlug.size);
    } catch (catError) {
      console.error('[templates] error sembrando categorías (JS template):', catError);
    }
  }

  const rows = jsTemplate.products.map((p, index) => ({
    business_id: businessId, name: p.name, description: p.description, price: p.price,
    category: (p.categorySlug && categoryNameBySlug[p.categorySlug]) || null,
    image_url: p.cardImageUrl, images: [p.cardImageUrl], card_image_url: p.cardImageUrl,
    thumbnail_url: p.thumbnailUrl, status: 'active', is_active: true, is_draft: false, sort_order: index,
  }));

  const { data, error } = await supabase?.from('wa_products')?.insert(rows)?.select('id');
  if (error) {
    console.error('[templates] insert error:', error);
    return { created: 0, categoriesCreated, skipped: false, reason: 'insert-error', error, templateKey, branding };
  }
  return { created: data?.length ?? rows.length, categoriesCreated, skipped: false, reason: null, error: null, templateKey, branding };
}
