// Acceso a datos de suscripción de negocios.
//
// Desde la migración 20261031120000_wa_businesses_access_hardening:
//  - anon y authenticated NO pueden leer email ni campos de plan de wa_businesses.
//  - La facturación se obtiene por RPC con chequeo de autorización en servidor:
//      wa_get_business_billing(p_business_id)   → dueño o admin
//      wa_admin_list_business_billing()          → solo admin
//      wa_get_business_effective_plan(p_business_id) → plan efectivo público (sin fechas)
//
// Este módulo es el único lugar que consulta esas RPC. Ningún componente debe
// volver a leer plan_slug/email directamente desde wa_businesses.
import { supabase } from '../lib/supabase';

/** Columnas que el cliente puede leer directamente de wa_businesses (catálogo y dueño). */
export const BUSINESS_PUBLIC_COLUMNS = [
  'id', 'user_id', 'name', 'description', 'whatsapp', 'address',
  'city', 'region', 'country', 'country_code', 'currency',
  'logo_url', 'cover_image_url', 'design_settings', 'lat', 'lng', 'og_image_url',
  'slug', 'is_active', 'rubro_id',
  'seo_family_key', 'seo_content_override', 'seo_content_ai',
  'instagram_url', 'tiktok_url', 'facebook_url', 'print_legend',
  'operating_days', 'order_message_template', 'ticket_logo_url',
  'business_mode', 'document_title_type',
  'onboarding_step', 'onboarding_completed_at',
  'created_at', 'updated_at',
].join(', ');

const firstRow = (data) => (Array.isArray(data) ? (data[0] ?? null) : (data ?? null));

/** Facturación del negocio para su dueño o admin. Devuelve { data: row|null, error }. */
export async function fetchOwnBusinessBilling(businessId) {
  if (!businessId) return { data: null, error: null };
  const { data, error } = await supabase.rpc('wa_get_business_billing', { p_business_id: businessId });
  return { data: firstRow(data), error: error ?? null };
}

/** Plan efectivo público de un negocio (límites). Devuelve { plan_slug: string|null, error }. */
export async function fetchBusinessEffectivePlan(businessId) {
  if (!businessId) return { plan_slug: null, error: null };
  const { data, error } = await supabase.rpc('wa_get_business_effective_plan', { p_business_id: businessId });
  // null = negocio no encontrado: el llamador omite el chequeo (igual que antes).
  return { plan_slug: typeof data === 'string' && data ? data : null, error: error ?? null };
}

/** Facturación de todos los negocios para el panel admin. Devuelve { map: Map<id,row>, error }. */
export async function fetchAdminBusinessBillingMap() {
  const { data, error } = await supabase.rpc('wa_admin_list_business_billing');
  if (error) return { map: new Map(), error };
  return { map: new Map((data || []).map((row) => [row.id, row])), error: null };
}

/** Detalle de un negocio para el panel admin: columnas públicas + facturación (RPC admin). */
export async function fetchAdminBusinessDetail(businessId) {
  const { data, error } = await supabase
    .from('wa_businesses')
    .select(BUSINESS_PUBLIC_COLUMNS)
    .eq('id', businessId)
    .single();
  if (error || !data) return { data: null, error: error ?? new Error('Business not found') };
  const { data: billing } = await fetchOwnBusinessBilling(businessId);
  return { data: { ...data, ...(billing ?? {}) }, error: null };
}
