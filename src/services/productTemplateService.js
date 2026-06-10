import { supabase } from '../lib/supabase';
import { getTemplateForRubro } from '../utils/productTemplates';

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
 * Además del resultado de la siembra devuelve el branding del template
 * (logo y cover prediseñados) para que el caller lo aplique al negocio
 * solo si este no tiene imágenes propias.
 *
 * @param {{ businessId: string, rubroSlug: string }} params
 * @returns {Promise<{
 *   created: number,
 *   skipped: boolean,
 *   reason: string|null,
 *   error: object|null,
 *   templateKey: string|null,
 *   branding: { logoUrl: string|null, coverImageUrl: string|null }|null,
 * }>}
 */
export async function seedTemplateProductsIfEmpty({ businessId, rubroSlug }) {
  if (!businessId || !rubroSlug) {
    return {
      created: 0, skipped: true, reason: 'missing-business-or-rubro-slug',
      error: null, templateKey: null, branding: null,
    };
  }

  const template = getTemplateForRubro(rubroSlug);
  if (!template || template.products.length === 0) {
    return {
      created: 0, skipped: true, reason: `no-template-for-rubro:${rubroSlug}`,
      error: null, templateKey: null, branding: null,
    };
  }
  const templateKey = template.templateKey;
  const branding = {
    logoUrl: template.logoUrl || null,
    coverImageUrl: template.coverImageUrl || null,
  };

  const { data: existing, error: existingError } = await supabase
    ?.from('wa_products')
    ?.select('id, name, status, is_active, is_draft')
    ?.eq('business_id', businessId)
    ?.limit(50);
  if (existingError) {
    console.error('[templates] error consultando productos existentes:', existingError);
    return {
      created: 0, skipped: true, reason: 'count-error',
      error: existingError, templateKey, branding,
    };
  }

  const realProducts = (existing || []).filter((p) => p?.is_draft !== true);
  console.log(
    '[templates] productos existentes:', existing?.length ?? 0,
    '| reales (no draft):', realProducts.length,
    existing,
  );
  if (realProducts.length > 0) {
    return {
      created: 0, skipped: true, reason: 'business-has-products',
      error: null, templateKey, branding,
    };
  }

  const rows = template.products.map((p, index) => ({
    business_id: businessId,
    name: p.name,
    description: p.description,
    price: p.price,
    image_url: p.cardImageUrl,
    images: [p.cardImageUrl],
    card_image_url: p.cardImageUrl,
    thumbnail_url: p.thumbnailUrl,
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
    console.error('[templates] insert error:', error);
    return {
      created: 0, skipped: false, reason: 'insert-error',
      error, templateKey, branding,
    };
  }

  return {
    created: data?.length ?? rows.length, skipped: false, reason: null,
    error: null, templateKey, branding,
  };
}
