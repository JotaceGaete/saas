import { requireAuthenticatedUser } from '../services/auth/requestAuthService.js';
import { assertBusinessOwnership } from '../services/billing/ownershipService.js';
import { getBillingSubscriptionState } from '../services/billing/subscriptionStateService.js';
import { isHttpError } from '../lib/http/HttpError.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function getBillingSubscriptionStateController(request) {
  try {
    const authUser = await requireAuthenticatedUser(request);
    const url = new URL(request.url);
    const businessId = String(url.searchParams.get('businessId') || '').trim();
    if (!businessId) {
      return json({ ok: false, error: 'businessId query param is required' }, 400);
    }

    await assertBusinessOwnership({ businessId, userId: authUser.id });
    const state = await getBillingSubscriptionState({ businessId });
    return json(state, 200);
  } catch (err) {
    const message = String(err?.message || '');
    if (message.includes('[auth] Missing Bearer token') || message.includes('[auth] Invalid or expired user token')) {
      return json({ ok: false, code: 'AUTH_REQUIRED', error: message || '[auth] Unauthorized' }, 401);
    }
    if (isHttpError(err)) {
      return json({
        ok: false,
        code: err?.code || null,
        provider: err?.provider || null,
        error: err.message,
        details: err?.details || null,
      }, err.statusCode);
    }
    return json({ ok: false, error: err?.message || 'subscription_state_failed' }, 503);
  }
}
