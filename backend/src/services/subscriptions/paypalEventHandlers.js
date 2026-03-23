import { applyEventSnapshot, applyRemoteSnapshot } from './syncService.js';
import { normalizePaypalEventType } from './paypalStateMapper.js';

function pickSubscriptionIdFromResource(resource) {
  const direct = resource?.id ? String(resource.id).trim() : '';
  const byAgreement = resource?.billing_agreement_id ? String(resource.billing_agreement_id).trim() : '';
  const related = resource?.supplementary_data?.related_ids?.subscription_id
    ? String(resource.supplementary_data.related_ids.subscription_id).trim()
    : '';
  return direct || related || byAgreement || null;
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

  // Eventos de pago relacionados a suscripción (ej. renovaciones).
  if (eventType.startsWith('PAYMENT.SALE.')) {
    const subscriptionId = pickSubscriptionIdFromResource(resource);
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
    return { handled: true, strategy: 'event_snapshot', eventType, subscriptionId: saved?.paypalSubscriptionId || subscriptionId };
  }

  return { handled: false, reason: 'unsupported_event_type', eventType };
}

