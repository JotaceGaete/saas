/**
 * Puente PayPal -> Affiliate Core. Responsabilidad única: cuando un
 * PAYMENT.SALE.COMPLETED representa un cobro real elegible, resolver el
 * usuario referido (fuentes durables, service role) y llamar EXCLUSIVAMENTE
 * wa_register_referral_paid_period(). Ninguna lógica de streak/comisión
 * vive acá -- ya está resuelta server-side (mismo principio que
 * supabase/functions/mp-webhook para Mercado Pago).
 *
 * No bloqueante por diseño: cualquier fallo (lookup, RPC) se atrapa acá
 * mismo y se reporta como {registered:false, reason}, nunca lanza -- el
 * llamador (paypalEventHandlers.js) no necesita su propio try/catch
 * adicional para el billing principal.
 */
import { createClient } from '@supabase/supabase-js';
import { getBillingSubscriptionByProviderSubscriptionId } from '../../repositories/billingSubscriptionRepository.js';

function getSupabaseUrl() {
  return String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
}

function getServiceRoleKey() {
  return String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

function getAdminClient() {
  const url = getSupabaseUrl();
  const key = getServiceRoleKey();
  if (!url || !key) {
    throw new Error('[paypal-referral-bridge] Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key);
}

/**
 * period_ref canónico para un cobro PayPal individual -- equivalente
 * conceptual a buildReferralPeriodRef('mp:'+paymentId) en
 * supabase/functions/mp-webhook/lib.ts. saleId = resource.id de un evento
 * PAYMENT.SALE.COMPLETED (la transacción/venta individual). NUNCA
 * billing_agreement_id: ese campo es constante para toda la vida de la
 * suscripción -- usarlo generaría un solo period_ref para todos los meses,
 * rompiendo el índice único (attribution_id, period_ref) de
 * referral_paid_periods.
 */
export function buildPaypalReferralPeriodRef(saleId) {
  const id = String(saleId || '').trim();
  if (!id) return null;
  return `paypal:${id}`;
}

/**
 * Monto de un resource Sale de PayPal: resource.amount = { total: "10.00",
 * currency: "USD" } (Payments API v1 -- mismo API que este código ya
 * consume para leer resource.billing_agreement_id, ver
 * paypalEventHandlers.js).
 *
 * ADVERTENCIA -- gap de evidencia documentado a propósito: no existe en
 * este repo ningún fixture/payload real capturado que confirme el shape
 * exacto de `amount` para este evento específico (sí existe para
 * billing_agreement_id/id/custom_id, ver scripts/paypal-event-handlers-
 * diagnostic.js, pero ese fixture nunca incluyó `amount`). Este shape se
 * basa en la documentación pública estable de PayPal Payments API v1 para
 * el resource Sale, consistente con billing_agreement_id ya usado en este
 * mismo código (ambos campos pertenecen al mismo API v1, no a v2
 * Orders/Captures, que usa amount.value en vez de amount.total). Si el
 * shape real difiere, esta función devuelve null y el período NUNCA se
 * registra -- jamás inventa un monto. Recomendado confirmar contra un
 * payload real de sandbox antes de ir a producción.
 */
export function parsePaypalSaleAmount(resource) {
  const total = resource?.amount?.total;
  if (total === undefined || total === null || String(total).trim() === '') return null;
  const parsed = Number(total);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

/**
 * true si resource.state, cuando el payload lo trae, es compatible con un
 * pago completado ('completed'). Si el campo no viene, NO bloquea por su
 * ausencia -- no hay evidencia en este repo de que todos los payloads de
 * PAYMENT.SALE.COMPLETED lo incluyan siempre; la señal primaria de que el
 * pago es real ya es el propio event_type, verificado por la firma del
 * webhook (verifyWebhookSignature) antes de llegar acá.
 */
export function isSaleStateCompleted(resource) {
  const state = resource?.state;
  if (state === undefined || state === null || String(state).trim() === '') return true;
  return String(state).trim().toLowerCase() === 'completed';
}

/**
 * true si un evento PAYMENT.SALE.COMPLETED es elegible para Affiliate
 * Core: mismo criterio conceptual que shouldRegisterReferralPaidPeriod()
 * en mp-webhook/lib.ts (status real + monto > 0), adaptado a los campos
 * disponibles en un webhook de PayPal. NO usa BILLING.SUBSCRIPTION.
 * ACTIVATED como pago (ese evento nunca llega a esta función -- ver
 * paypalEventHandlers.js) ni trial (sin cobro real, amount no estaría
 * presente/sería 0).
 */
export function isEligiblePaypalSaleCompleted({ eventType, saleId, paypalSubscriptionId, createTime, amount, resource }) {
  if (eventType !== 'PAYMENT.SALE.COMPLETED') return false;
  if (!String(saleId || '').trim()) return false;
  if (!String(paypalSubscriptionId || '').trim()) return false;
  if (!createTime || Number.isNaN(new Date(createTime).getTime())) return false;
  if (typeof amount !== 'number' || !(amount > 0)) return false;
  if (!isSaleStateCompleted(resource)) return false;
  return true;
}

/**
 * Resuelve el user_id referido a partir de un paypalSubscriptionId, usando
 * EXCLUSIVAMENTE fuentes durables (Supabase real, service role) -- nunca
 * el JSON local efímero de paypalSubscriptionRepository.js:
 *   paypalSubscriptionId -> billing_subscriptions.business_id  (ya
 *     resuelto de forma durable, ver getBillingSubscriptionByProvider
 *     SubscriptionId en billingSubscriptionRepository.js)
 *   business_id -> wa_businesses.user_id
 * Nunca inventa: si cualquier paso no resuelve o falla, devuelve null.
 */
export async function resolveReferredUserId(paypalSubscriptionId) {
  const subscriptionId = String(paypalSubscriptionId || '').trim();
  if (!subscriptionId) return null;

  let businessId = null;
  try {
    const billingSubscription = await getBillingSubscriptionByProviderSubscriptionId('paypal', subscriptionId);
    businessId = billingSubscription?.business_id || null;
  } catch (error) {
    console.warn('[paypal-referral-bridge] billing_subscriptions lookup failed', {
      subscriptionId,
      reason: error?.message || 'unknown_error',
    });
    return null;
  }
  if (!businessId) return null;

  try {
    const admin = getAdminClient();
    const { data, error } = await admin
      .from('wa_businesses')
      .select('user_id')
      .eq('id', businessId)
      .maybeSingle();
    if (error) {
      console.warn('[paypal-referral-bridge] wa_businesses lookup failed', {
        subscriptionId,
        reason: error.message,
      });
      return null;
    }
    return data?.user_id || null;
  } catch (error) {
    console.warn('[paypal-referral-bridge] wa_businesses lookup threw', {
      subscriptionId,
      reason: error?.message || 'unknown_error',
    });
    return null;
  }
}

/**
 * Punto de entrada único del bridge. Estrictamente no bloqueante: nunca
 * lanza -- cualquier fallo (elegibilidad, resolución, RPC) devuelve
 * {registered:false, reason}. El llamador no necesita try/catch propio,
 * pero paypalEventHandlers.js igual lo envuelve en uno por defensa en
 * profundidad (ver comentario ahí).
 */
export async function registerPaypalReferralPaidPeriod({ eventType, resource }) {
  const saleId = resource?.id ? String(resource.id).trim() : '';
  const paypalSubscriptionId = resource?.billing_agreement_id ? String(resource.billing_agreement_id).trim() : '';
  const createTime = resource?.create_time || null;
  const amount = parsePaypalSaleAmount(resource);

  if (!isEligiblePaypalSaleCompleted({ eventType, saleId, paypalSubscriptionId, createTime, amount, resource })) {
    return { registered: false, reason: 'not_eligible' };
  }

  try {
    const referredUserId = await resolveReferredUserId(paypalSubscriptionId);
    if (!referredUserId) {
      console.warn('[paypal-referral-bridge] referred user not resolved, skipping', {
        eventType,
        saleId,
        subscriptionId: paypalSubscriptionId,
      });
      return { registered: false, reason: 'referred_user_not_resolved' };
    }

    const periodRef = buildPaypalReferralPeriodRef(saleId);
    const admin = getAdminClient();
    const { data, error } = await admin.rpc('wa_register_referral_paid_period', {
      p_referred_user_id: referredUserId,
      p_period_ref: periodRef,
      p_period_start: createTime,
    });
    if (error) {
      console.warn('[paypal-referral-bridge] wa_register_referral_paid_period rpc error', {
        eventType,
        saleId,
        subscriptionId: paypalSubscriptionId,
        reason: error.message,
      });
      return { registered: false, reason: 'rpc_error' };
    }
    return { registered: true, periodRef, result: data };
  } catch (error) {
    console.warn('[paypal-referral-bridge] registerPaypalReferralPaidPeriod failed', {
      eventType,
      saleId,
      subscriptionId: paypalSubscriptionId,
      reason: error?.message || 'unknown_error',
    });
    return { registered: false, reason: 'unexpected_error' };
  }
}
