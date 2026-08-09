/**
 * Servicio cliente de solo lectura para el Panel de Afiliados.
 * Wrappers delgados sobre wa_get_my_referral_stats() y
 * wa_list_my_referrals() (supabase/migrations/20260809100000_affiliate_panel_read_rpcs.sql).
 * Ninguna lógica de negocio vive acá -- toda la agregación, los límites de
 * paginación y las reglas de calificación ya están resueltas server-side.
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
