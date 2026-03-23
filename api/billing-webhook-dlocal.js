import { isHttpError } from '../backend/src/lib/http/HttpError.js';
import {
  markWebhookEventFailed,
  markWebhookEventProcessed,
  reserveWebhookEventProcessing,
} from '../backend/src/repositories/billingWebhookEventRepository.js';
import { processDlocalWebhook } from '../backend/src/services/billing/dlocalWebhookService.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request) {
  let eventId = null;
  let eventType = null;
  try {
    const payload = await request.json();
    eventId = String(payload?.event_id || payload?.id || '').trim() || null;
    eventType = String(payload?.event_type || payload?.type || '').trim() || null;
    if (!eventId) {
      return json({ ok: false, error: '[dlocal-webhook] Missing event_id/id' }, 400);
    }
    const reservation = await reserveWebhookEventProcessing({
      provider: 'dlocal',
      eventId,
      eventType,
      payload,
    });
    if (reservation.duplicated) {
      console.info('[DLOCAL_WEBHOOK_DUPLICATE]', { event_id: eventId, event_type: eventType });
      return json({ ok: true, duplicated: true, eventId, eventType });
    }
    const result = await processDlocalWebhook({ headers: request.headers, payload });
    await markWebhookEventProcessed({ provider: 'dlocal', eventId });
    console.info('[DLOCAL_WEBHOOK_PROCESSED]', {
      event_id: eventId,
      business_id: result?.businessId || null,
      provider_status: result?.provider_status || null,
      status: result?.status || null,
    });
    return json(result, 200);
  } catch (err) {
    if (eventId) {
      try {
        await markWebhookEventFailed({
          provider: 'dlocal',
          eventId,
          errorMessage: err?.message || 'unknown_error',
        });
      } catch {}
    }
    console.error('[DLOCAL_WEBHOOK_ERROR]', { message: err?.message || 'unknown_error' });
    if (isHttpError(err)) {
      return json({ ok: false, error: err.message }, err.statusCode);
    }
    return json({ ok: false, error: err?.message || 'dlocal_webhook_failed' }, 503);
  }
}
