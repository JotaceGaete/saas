/**
 * Business Provisioner
 *
 * Activa los Outputs en base de datos según lo que el motor decidió.
 * Es la única capa que conoce Supabase en todo el módulo `business/`.
 * El motor de decisiones (businessEngine.js) no la importa.
 */

import { supabase } from '../../lib/supabase';
import { createBusinessConfig } from '../businessEngine.js';

/**
 * Persiste la configuración inicial del negocio en Supabase.
 * Se llama una vez, al finalizar el onboarding.
 *
 * @param {string} businessId
 * @param {string} blueprintSlug
 * @param {string[]} goalSlugs
 * @param {Object} businessData - { name, city, phone, logoUrl, countryCode }
 * @returns {Promise<{ config: BusinessConfig, error: Error|null }>}
 */
export async function provisionBusiness(businessId, blueprintSlug, goalSlugs, businessData) {
  const config = createBusinessConfig(blueprintSlug, goalSlugs, businessData);

  // 1. Guardar Blueprint y Goals en el negocio
  const { error: bizError } = await supabase
    .from('wa_businesses')
    .update({
      blueprint_slug: config.blueprint,
      active_goals: config.goals,
    })
    .eq('id', businessId);

  if (bizError) return { config, error: bizError };

  // 2. Activar cada Output
  const outputRows = config.outputs.map(slug => ({
    business_id: businessId,
    output_type: slug,
    status: 'active',
    config: {},
  }));

  const { error: outputError } = await supabase
    .from('wa_business_outputs')
    .upsert(outputRows, { onConflict: 'business_id,output_type' });

  if (outputError) return { config, error: outputError };

  // 3. Crear páginas del sitio si website está activo
  if (config.outputs.includes('website') && config.website.pages.length > 0) {
    const pageRows = config.website.pages.map((pageType, i) => ({
      business_id: businessId,
      page_type: pageType,
      layout_variant: config.website.layout,
      position: i,
      published: false,
      content: config.website.initialCopy,
    }));

    const { error: pageError } = await supabase
      .from('wa_website_pages')
      .upsert(pageRows, { onConflict: 'business_id,page_type' });

    if (pageError) return { config, error: pageError };
  }

  return { config, error: null };
}

/**
 * Activa un Output adicional para un negocio existente.
 * Las dependencias se resuelven automáticamente.
 *
 * @param {string} businessId
 * @param {string} outputSlug
 * @returns {Promise<{ error: Error|null }>}
 */
export async function activateOutput(businessId, outputSlug) {
  const { error } = await supabase
    .from('wa_business_outputs')
    .upsert(
      { business_id: businessId, output_type: outputSlug, status: 'active', config: {} },
      { onConflict: 'business_id,output_type' },
    );
  return { error };
}

/**
 * Lee la configuración activa de un negocio desde Supabase
 * y la reconstruye con el motor.
 *
 * @param {string} businessId
 * @returns {Promise<{ config: BusinessConfig|null, error: Error|null }>}
 */
export async function loadBusinessConfig(businessId) {
  const { data, error } = await supabase
    .from('wa_businesses')
    .select('blueprint_slug, active_goals, name, country_code')
    .eq('id', businessId)
    .single();

  if (error || !data) return { config: null, error };

  const config = createBusinessConfig(
    data.blueprint_slug ?? 'servicios',
    data.active_goals ?? [],
    { name: data.name, countryCode: data.country_code },
  );

  return { config, error: null };
}
