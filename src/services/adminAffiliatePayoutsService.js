/**
 * Servicio admin: retiros (payouts) del programa de afiliados. Wrappers
 * delgados sobre wa_admin_list_referral_payouts,
 * wa_admin_get_referral_payout_detail, wa_admin_mark_referral_payout_paid y
 * wa_admin_reject_referral_payout (supabase/migrations/
 * 20260815100000_referral_payout_requests.sql y
 * 20260816100000_referral_payout_read_api.sql). Ninguna lógica de negocio
 * vive acá: permisos, montos, masking y transiciones de estado ya están
 * resueltos server-side. El payload se devuelve tal cual (incluido su campo
 * `ok`/`error`) para que quien llame interprete cada reason code
 * documentado en la RPC (forbidden, invalid_status, payout_amount_changed,
 * etc.).
 */
import { supabase } from '../lib/supabase';

/** Listado admin de retiros, con totalCount (mismo filtro, sin limit/offset) para paginación. */
export async function listReferralPayouts({ status, limit = 30, offset = 0 } = {}) {
  const { data, error } = await supabase.rpc('wa_admin_list_referral_payouts', {
    p_status: status || null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return data;
}

/** Detalle completo de un retiro (incluye payoutMethodSnapshot íntegro) + comisiones vinculadas. */
export async function getReferralPayoutDetail(payoutId) {
  const { data, error } = await supabase.rpc('wa_admin_get_referral_payout_detail', {
    p_payout_id: payoutId,
  });
  if (error) throw error;
  return data;
}

/** Marca un retiro como pagado. external_reference es obligatoria (la RPC también la exige). */
export async function markReferralPayoutPaid(payoutId, externalReference) {
  const { data, error } = await supabase.rpc('wa_admin_mark_referral_payout_paid', {
    p_payout_id: payoutId,
    p_external_reference: externalReference,
  });
  if (error) throw error;
  return data;
}

/** Rechaza un retiro y libera sus comisiones. reason es obligatorio (la RPC también lo exige). */
export async function rejectReferralPayout(payoutId, reason) {
  const { data, error } = await supabase.rpc('wa_admin_reject_referral_payout', {
    p_payout_id: payoutId,
    p_reason: reason,
  });
  if (error) throw error;
  return data;
}
