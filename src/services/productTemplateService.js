import { supabase } from '../lib/supabase';
import { getTemplateProductsForRubro } from '../utils/productTemplates';

/**
 * Siembra productos de ejemplo en wa_products según el rubro del negocio.
 *
 * Automático e invisible: se llama al guardar el rubro principal en
 * /business-configuration. Solo inserta si el negocio tiene 0 productos
 * (de cualquier estado) y existe un template para el rubro. Los productos
 * quedan is_active=true y status='active' para que aparezcan de inmediato
 * en el catálogo; el usuario los edita después desde /product-editor.
 *
 * @param {{ businessId: string, rubroSlug: string }} params
 * @returns {Promise<{ created: number, skipped: boolean, error: object|null }>}
 */
export async function seedTemplateProductsIfEmpty({ businessId, rubroSlug }) {
  if (!businessId || !rubroSlug) return { created: 0, skipped: true, error: null };

  const templateProducts = getTemplateProductsForRubro(rubroSlug);
  if (templateProducts.length === 0) return { created: 0, skipped: true, error: null };

  const { count, error: countError } = await supabase
    ?.from('wa_products')
    ?.select('id', { count: 'exact', head: true })
    ?.eq('business_id', businessId);
  if (countError) {
    console.error('[productTemplateService] count error:', countError);
    return { created: 0, skipped: true, error: countError };
  }
  if ((count ?? 0) > 0) return { created: 0, skipped: true, error: null };

  const rows = templateProducts.map((p, index) => ({
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
    console.error('[productTemplateService] insert error:', error);
    return { created: 0, skipped: false, error };
  }

  return { created: data?.length ?? rows.length, skipped: false, error: null };
}
