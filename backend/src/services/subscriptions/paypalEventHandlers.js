import { applyEventSnapshot, applyRemoteSnapshot } from './syncService.js';
import { normalizePaypalEventType } from './paypalStateMapper.js';
import { registerPaypalReferralPaidPeriod } from './paypalReferralBridge.js';

function pickSubscriptionIdFromResource(resource) {
  const direct = resource?.id ? String(resource.id).trim() : '';
  const byAgreement = resource?.billing_agreement_id ? String(resource.billing_agreement_id).trim() : '';
  const related = resource?.supplementary_data?.related_ids?.subscription_id
    ? String(resource.supplementary_data.related_ids.subscription_id).trim()
    : '';
  return direct || related || byAgreement || null;
}

/**
 * Extrae el subscription id de un resource Sale (eventos PAYMENT.SALE.*)
 * -- NUNCA pickSubscriptionIdFromResource() de arriba: esa función
 * prioriza resource.id, que para un resource Sale es el ID de la venta/
 * transacción individual (ej. "8RX123..."), no el de la suscripción. Un
 * resource Sale identifica su suscripción exclusivamente vía
 * billing_agreement_id (o, como respaldo documentado por PayPal,
 * supplementary_data.related_ids.subscription_id) -- jamás via su propio
 * `id`. Reutilizar la función genérica acá pasaría el ID de venta como si
 * fuera el de suscripción, rompiendo tanto el espejo a billing_
 * subscriptions como la resolución de Affiliate Core.
 */
function pickSubscriptionIdFromSaleResource(resource) {
  const byAgreement = resource?.billing_agreement_id ? String(resource.billing_agreement_id).trim() : '';
  const related = resource?.supplementary_data?.related_ids?.subscription_id
    ? String(resource.supplementary_data.related_ids.subscription_id).trim()
    : '';
  return byAgreement || related || null;
}

function isSubscriptionEntity(resource) {
  const id = String(resource?.id || '').trim();
  return id.startsWith('I-');
}

/**
 * Handler genérico webhook-ready para eventos PayPal.
 * Espera payload completo de webhook, pero no depende de HTTP.
 */
export async function handlePaypalEvent(eventPayload) {
  const eventType = normalizePaypalEventType(eventPayload?.event_type);
  const resource = eventPayload?.resource || {};
  if (!eventType) {
    return { handled: false, reason: 'missing_event_type' };
  }

  // Eventos de suscripción: usar snapshot completo si viene entidad I-*
  if (eventType.startsWith('BILLING.SUBSCRIPTION.')) {
    if (isSubscriptionEntity(resource)) {
      const saved = await applyRemoteSnapshot(resource);
      return { handled: true, strategy: 'remote_snapshot', eventType, subscriptionId: saved?.paypalSubscriptionId || resource?.id || null };
    }

    const subscriptionId = pickSubscriptionIdFromResource(resource);
    if (!subscriptionId) {
      return { handled: false, reason: 'missing_subscription_id', eventType };
    }

    const saved = await applyEventSnapshot({
      eventType,
      paypalSubscriptionId: subscriptionId,
      paypalStatus: resource?.status || null,
      paypalPlanId: resource?.plan_id || null,
      customId: resource?.custom_id || null,
      subscriberEmail: resource?.subscriber?.email_address || null,
    });
    return { handled: true, strategy: 'event_snapshot', eventType, subscriptionId: saved?.paypalSubscriptionId || subscriptionId };
  }

  // Eventos de pago relacionados a suscripción (ej. renovaciones). Incluye
  // COMPLETED (cobro real), REFUNDED y REVERSED (reversiones de dinero) y
  // cualquier otro sub-evento PAYMENT.SALE.* -- el espejo a
  // billing_subscriptions corre igual para los tres, sin cambios respecto
  // al comportamiento anterior.
  if (eventType.startsWith('PAYMENT.SALE.')) {
    const subscriptionId = pickSubscriptionIdFromSaleResource(resource);
    if (!subscriptionId) {
      return { handled: false, reason: 'missing_subscription_id', eventType };
    }
    const saved = await applyEventSnapshot({
      eventType,
      paypalSubscriptionId: subscriptionId,
      paypalStatus: null,
      paypalPlanId: null,
      customId: null,
      subscriberEmail: null,
    });

    // Affiliate Core -- SOLO para PAYMENT.SALE.COMPLETED (cobro real).
    // Estrictamente no bloqueante: registerPaypalReferralPaidPeriod() ya
    // atrapa sus propios errores internamente y nunca lanza, pero se
    // envuelve en try/catch igual por defensa en profundidad -- ningún
    // fallo acá puede impedir que este webhook termine de procesar
    // billing normalmente ni hacer que se marque como failed.
    //
    // PAYMENT.SALE.REFUNDED / PAYMENT.SALE.REVERSED: deliberadamente NO
    // se registran como pago ni se revierte nada en Affiliate Core acá.
    // Gap documentado (no implementado a propósito): no hay evidencia en
    // este repo de que resource.sale_id venga de forma confiable en estos
    // eventos para reconstruir el period_ref original -- ver auditoría
    // previa. wa_reverse_referral_paid_period() queda para una fase
    // siguiente, una vez confirmado ese payload real.
    if (eventType === 'PAYMENT.SALE.COMPLETED') {
      try {
        await registerPaypalReferralPaidPeriod({ eventType, resource });
      } catch (error) {
        console.warn('[paypal-event-handlers] affiliate core registration failed', {
          eventType,
          saleId: resource?.id || null,
          reason: error?.message || 'unknown_error',
        });
      }
    }

    return { handled: true, strategy: 'event_snapshot', eventType, subscriptionId: saved?.paypalSubscriptionId || subscriptionId };
  }

  return { handled: false, reason: 'unsupported_event_type', eventType };
}

