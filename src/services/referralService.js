/**
 * Servicio cliente para el programa de afiliados (Affiliate Core de
 * walinkaref, mismo proyecto Supabase). Wrappers delgados sobre
 * wa_get_my_referral_stats(), wa_list_my_referrals()
 * (supabase/migrations/20260809100000_affiliate_panel_read_rpcs.sql) y
 * wa_attribute_referral() (supabase/migrations/20260808120000_referral_core_user_centric.sql).
 * Ninguna lógica de negocio vive acá -- toda la agregación, los límites de
 * paginación, la idempotencia y las reglas de calificación/atribución ya
 * están resueltas server-side.
 */
import { supabase } from '../lib/supabase';

/** Resumen agregado del programa de afiliados para el usuario actual. */
export async function getMyReferralStats() {
  const { data, error } = await supabase.rpc('wa_get_my_referral_stats');
  if (error) throw error;
  return data;
}

/** Lista paginada de los referidos del usuario actual (sin PII). */
export async function listMyReferrals({ limit = 20, offset = 0 } = {}) {
  const { data, error } = await supabase.rpc('wa_list_my_referrals', {
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return data || [];
}

/**
 * Atribuye al usuario autenticado actual (auth.uid()) como referido del
 * dueño de `code`. Requiere sesión válida -- la propia RPC lanza
 * NOT_AUTHENTICATED si no la hay. Idempotente: ver
 * src/utils/referralAttribution.js para cómo se interpreta la respuesta.
 * @param {string} code
 * @param {string} clickAt ISO timestamp del momento original de llegada (no el del signup)
 */
export async function attributeReferral(code, clickAt) {
  const { data, error } = await supabase.rpc('wa_attribute_referral', {
    p_code: code,
    p_click_at: clickAt,
  });
  if (error) throw error;
  return data;
}
