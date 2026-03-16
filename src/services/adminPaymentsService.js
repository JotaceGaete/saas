/**
 * Servicio admin: pagos, suscripciones, notificaciones y acciones.
 * Solo para usuarios con role admin. Usa wa_payments_admin_view, wa_admin_notifications, RPCs.
 */
import { supabase } from '../lib/supabase';

/** Estadísticas para dashboard de pagos/suscripciones */
export async function getAdminPaymentsStats() {
  const { data, error } = await supabase.rpc('wa_admin_payments_stats');
  if (error) return { data: null, error };
  return { data: data || null, error: null };
}

/** Planes más vendidos (conteo por plan_slug) */
export async function getAdminPlansSold() {
  const { data, error } = await supabase.rpc('wa_admin_plans_sold');
  if (error) return { data: [], error };
  return { data: data || [], error: null };
}

/**
 * Listado de pagos con filtros.
 * @param {Object} opts - { status, planSlug, origin, dateFrom, dateTo, search (nombre negocio, email o payment id), limit, offset }
 */
export async function getAdminPayments(opts = {}) {
  let q = supabase
    .from('wa_payments_admin_view')
    .select('*', { count: 'exact' });

  if (opts.status) {
    q = q.eq('status', opts.status);
  }
  if (opts.planSlug) {
    q = q.eq('plan_slug', opts.planSlug);
  }
  if (opts.origin) {
    q = q.eq('origin', opts.origin);
  }
  if (opts.dateFrom) {
    q = q.gte('created_at', opts.dateFrom);
  }
  if (opts.dateTo) {
    q = q.lte('created_at', opts.dateTo);
  }
  if (opts.search && opts.search.trim()) {
    const s = opts.search.trim().replace(/'/g, "''");
    q = q.or(`business_name.ilike.%${s}%,user_email.ilike.%${s}%,id.ilike.%${s}%`);
  }

  q = q.order('created_at', { ascending: false });
  const limit = Math.min(Number(opts.limit) || 50, 200);
  const offset = Number(opts.offset) || 0;
  q = q.range(offset, offset + limit - 1);

  const { data, error, count } = await q;
  if (error) return { data: [], total: 0, error };
  return { data: data || [], total: count ?? 0, error: null };
}

/** Detalle de un pago (desde la vista) + eventos del webhook */
export async function getAdminPaymentDetail(paymentId) {
  const [payRes, eventsRes] = await Promise.all([
    supabase.from('wa_payments_admin_view').select('*').eq('id', paymentId).maybeSingle(),
    supabase.from('wa_payment_events').select('*').eq('payment_id', paymentId).order('processed_at', { ascending: false }),
  ]);
  if (payRes.error) return { data: null, error: payRes.error };
  if (eventsRes.error) return { data: null, error: eventsRes.error };
  return {
    data: {
      payment: payRes.data,
      events: eventsRes.data || [],
    },
    error: null,
  };
}

/** Detalle de suscripción por negocio: negocio + últimos pagos + eventos recientes */
export async function getAdminBusinessSubscription(businessId) {
  const [bizRes, paymentsRes, auditRes] = await Promise.all([
    supabase.from('wa_businesses').select('*').eq('id', businessId).single(),
    supabase.from('wa_payments').select('*').eq('business_id', businessId).order('created_at', { ascending: false }).limit(20),
    supabase.from('wa_admin_audit_log').select('*').eq('entity_type', 'business').eq('entity_id', businessId).order('created_at', { ascending: false }).limit(20),
  ]);
  if (bizRes.error || !bizRes.data) return { data: null, error: bizRes.error || new Error('Business not found') };
  const paymentIds = (paymentsRes.data || []).map((p) => p.id).filter(Boolean);
  let events = [];
  if (paymentIds.length > 0) {
    const { data: ev } = await supabase.from('wa_payment_events').select('*').in('payment_id', paymentIds).order('processed_at', { ascending: false }).limit(50);
    events = ev || [];
  }
  return {
    data: {
      business: bizRes.data,
      payments: paymentsRes.data || [],
      events,
      auditLog: auditRes.data || [],
    },
    error: null,
  };
}

// ——— Notificaciones ———

export async function getAdminNotifications(opts = {}) {
  let q = supabase
    .from('wa_admin_notifications')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });
  if (opts.unreadOnly) {
    q = q.is('read_at', null);
  }
  const limit = Math.min(Number(opts.limit) || 50, 100);
  q = q.limit(limit);
  const { data, error, count } = await q;
  if (error) return { data: [], total: 0, error };
  return { data: data || [], total: count ?? 0, error: null };
}

export async function markAdminNotificationRead(id) {
  const { data, error } = await supabase
    .from('wa_admin_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) return { data: null, error };
  return { data, error: null };
}

export async function markAllAdminNotificationsRead() {
  const { error } = await supabase
    .from('wa_admin_notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null);
  if (error) return { error };
  return { error: null };
}

// ——— Audit log global ———

export async function getAdminAuditLog(opts = {}) {
  let q = supabase
    .from('wa_admin_audit_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (opts.entityType) {
    q = q.eq('entity_type', opts.entityType);
  }
  if (opts.entityId) {
    q = q.eq('entity_id', opts.entityId);
  }
  if (opts.action) {
    q = q.eq('action', opts.action);
  }
  if (opts.adminUserId) {
    q = q.eq('admin_user_id', opts.adminUserId);
  }
  if (opts.dateFrom) {
    q = q.gte('created_at', opts.dateFrom);
  }
  if (opts.dateTo) {
    q = q.lte('created_at', opts.dateTo);
  }

  const limit = Math.min(Number(opts.limit) || 50, 200);
  const offset = Number(opts.offset) || 0;
  q = q.range(offset, offset + limit - 1);

  const { data, error, count } = await q;
  if (error) return { data: [], total: 0, error };
  return { data: data || [], total: count ?? 0, error: null };
}

// ——— Acciones admin ———

export async function adminExtendPlan(businessId, days, reason = null) {
  const { data, error } = await supabase.rpc('wa_admin_extend_plan', {
    p_business_id: businessId,
    p_days: days,
    p_reason: reason || null,
  });
  if (error) return { data: null, error };
  if (data?.ok === false) return { data: null, error: { message: data.error || 'Error' } };
  return { data, error: null };
}

export async function adminChangePlan(businessId, newPlanSlug, reason = null) {
  const { data, error } = await supabase.rpc('wa_admin_change_plan', {
    p_business_id: businessId,
    p_new_plan_slug: newPlanSlug,
    p_reason: reason || null,
  });
  if (error) return { data: null, error };
  if (data?.ok === false) return { data: null, error: { message: data.error || 'Error' } };
  return { data, error: null };
}
