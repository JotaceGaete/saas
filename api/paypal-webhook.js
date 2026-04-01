import { getPaypalMode } from '../backend/src/config/paypal/index.js';
import {
  markWebhookEventFailed,
  markWebhookEventProcessed,
  reserveWebhookEventProcessing,
} from '../backend/src/repositories/paypalWebhookEventRepository.js';
import { verifyWebhookSignature, WebhookInfrastructureError, WebhookVerificationError } from '../backend/src/services/paypal/webhookVerifier.js';
import { handlePaypalEvent } from '../backend/src/services/subscriptions/paypalEventHandlers.js';
import { isHttpError } from '../backend/src/lib/http/HttpError.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request) {
  let eventId = null;
  let eventType = null;
  let subscriptionId = null;
  let businessId = null;
  try {
    const rawBody = await request.text();
    const verification = await verifyWebhookSignature({
      headers: request.headers,
      rawBody,
    });
    const event = verification.event || {};
    eventId = String(event.id || '').trim() || null;
    eventType = String(event.event_type || '').trim() || null;
    const resource = event?.resource || {};
    subscriptionId = String(
      resource?.id
      || resource?.billing_agreement_id
      || resource?.supplementary_data?.related_ids?.subscription_id
      || '',
    ).trim() || null;
    const customId = String(resource?.custom_id || '').trim();
    if (customId.startsWith('business:')) {
      businessId = customId.slice('business:'.length) || null;
    }

    if (!eventId) {
      throw new WebhookVerificationError('missing_event_id');
    }

    const environment = getPaypalMode();
    const reservation = await reserveWebhookEventProcessing({
      environment,
      eventId,
      eventType,
      payload: event,
    });
    if (reservation.duplicated) {
      console.info('[PAYPAL_WEBHOOK_DUPLICATE]', { event_id: eventId, subscription_id: subscriptionId, business_id: businessId, event_type: eventType });
      return json({ ok: true, duplicated: true, eventId, eventType });
    }

    const result = await handlePaypalEvent(event);
    if (!result?.handled) {
      await markWebhookEventFailed({
        environment,
        eventId,
        errorMessage: result?.reason || 'event_not_handled',
      });
      console.error('[PAYPAL_WEBHOOK_ERROR]', {
        event_id: eventId,
        subscription_id: subscriptionId,
        business_id: businessId,
        message: result?.reason || 'event_not_handled',
      });
      return json({ ok: false, error: 'event_not_handled', reason: result?.reason || null }, 503);
    }

    await markWebhookEventProcessed({ environment, eventId });
    console.info('[PAYPAL_WEBHOOK_PROCESSED]', {
      event_id: eventId,
      subscription_id: subscriptionId,
      business_id: businessId,
      event_type: eventType,
      strategy: result?.strategy || null,
    });

    return json({
      ok: true,
      duplicated: false,
      eventId,
      eventType,
      handled: true,
      strategy: result?.strategy || null,
      reason: null,
    });
  } catch (err) {
    const environment = (() => {
      try {
        return getPaypalMode();
      } catch {
        // No asumir sandbox en producción: env inválido o no cargado.
        return 'unknown';
      }
    })();
    if (eventId) {
      try {
        await markWebhookEventFailed({
          environment,
          eventId,
          errorMessage: err?.message || 'unknown_error',
        });
      } catch {}
    }
    console.error('[PAYPAL_WEBHOOK_ERROR]', {
      event_id: eventId,
      subscription_id: subscriptionId,
      business_id: businessId,
      message: err?.message || 'unknown_error',
    });

    if (err instanceof WebhookVerificationError) {
      return json({ ok: false, error: 'invalid_webhook', reason: err.message }, 400);
    }
    if (err instanceof WebhookInfrastructureError) {
      return json({ ok: false, error: 'infrastructure_error', reason: err.message }, err.statusCode || 503);
    }
    if (isHttpError(err)) {
      const status = err.statusCode >= 500 ? 503 : err.statusCode;
      return json({ ok: false, error: 'webhook_error', reason: err.message }, status);
    }
    return json({ ok: false, error: 'webhook_error', reason: err?.message || 'unknown_error' }, 503);
  }
}
