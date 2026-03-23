import {
  cancelSubscription,
  createSubscription,
  getLocalSubscriptionRecord,
  getSubscription,
} from '../services/paypal/subscriptionService.js';
import { assertPaypalAllowedForRequest } from '../services/billing/eligibilityService.js';
import { requireAuthenticatedUser } from '../services/auth/requestAuthService.js';
import { assertBusinessOwnership } from '../services/billing/ownershipService.js';
import { HttpError, isHttpError } from '../lib/http/HttpError.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function handleControllerError(err, fallbackMessage) {
  if (isHttpError(err)) {
    return json({ ok: false, error: err.message }, err.statusCode);
  }
  return json({ ok: false, error: err?.message || fallbackMessage }, 503);
}

function ensureRecordOwnership({ record, authUserId }) {
  if (!record) return;
  const recordUserId = String(record?.userId || '').trim();
  if (!recordUserId || recordUserId !== authUserId) {
    throw new HttpError(403, '[ownership] Forbidden subscription access');
  }
}

export async function createPaypalSubscriptionController(request) {
  try {
    assertPaypalAllowedForRequest(request);
    const authUser = await requireAuthenticatedUser(request);
    const body = await readJsonBody(request);
    const businessId = String(body?.businessId || '').trim();
    if (!businessId) {
      throw new HttpError(400, 'businessId is required');
    }
    await assertBusinessOwnership({ businessId, userId: authUser.id });
    console.info('[PAYPAL_SUBSCRIPTION_CREATE_REQUEST]', {
      business_id: businessId,
      user_id: authUser.id,
      plan_slug: String(body?.planSlug || '').trim().toLowerCase() || null,
    });

    const result = await createSubscription({
      internalPlanSlug: body?.planSlug,
      userId: authUser.id,
      businessId,
      subscriberEmail: body?.email,
      returnUrl: body?.returnUrl || 'https://go.ventalink.app/billing/paypal/success',
      cancelUrl: body?.cancelUrl || 'https://go.ventalink.app/billing/paypal/cancel',
    });
    return json({
      ok: true,
      subscriptionId: result.id,
      status: result.status,
      approveUrl: result.approveUrl,
      customId: result.customId,
      paypalPlanId: result.paypalPlanId,
    });
  } catch (err) {
    console.error('[PAYPAL_SUBSCRIPTION_CREATE_ERROR]', {
      business_id: null,
      subscription_id: null,
      message: err?.message || 'unknown_error',
    });
    return handleControllerError(err, 'create_subscription_failed');
  }
}

export async function getPaypalSubscriptionController(request) {
  try {
    assertPaypalAllowedForRequest(request);
    const authUser = await requireAuthenticatedUser(request);
    const url = new URL(request.url);
    const subscriptionId = url.searchParams.get('subscriptionId') || '';
    const businessId = String(url.searchParams.get('businessId') || '').trim();
    console.info('[PAYPAL_SUBSCRIPTION_GET_REQUEST]', {
      subscription_id: subscriptionId || null,
      business_id: businessId || null,
      user_id: authUser.id,
    });
    if (!subscriptionId) {
      return json({ ok: false, error: 'subscriptionId query param is required' }, 400);
    }
    if (businessId) {
      await assertBusinessOwnership({ businessId, userId: authUser.id });
    }
    const localBefore = await getLocalSubscriptionRecord(subscriptionId);
    if (!localBefore && !businessId) {
      throw new HttpError(400, 'businessId is required when local subscription record is missing');
    }
    ensureRecordOwnership({ record: localBefore, authUserId: authUser.id });

    const remote = await getSubscription(subscriptionId);
    const local = await getLocalSubscriptionRecord(subscriptionId);
    ensureRecordOwnership({ record: local, authUserId: authUser.id });
    return json({ ok: true, remote, local });
  } catch (err) {
    console.error('[PAYPAL_SUBSCRIPTION_GET_ERROR]', {
      business_id: null,
      subscription_id: null,
      message: err?.message || 'unknown_error',
    });
    return handleControllerError(err, 'get_subscription_failed');
  }
}

export async function cancelPaypalSubscriptionController(request) {
  try {
    assertPaypalAllowedForRequest(request);
    const authUser = await requireAuthenticatedUser(request);
    const body = await readJsonBody(request);
    const subscriptionId = String(body?.subscriptionId || '').trim();
    const businessId = String(body?.businessId || '').trim();
    console.info('[PAYPAL_SUBSCRIPTION_CANCEL_REQUEST]', {
      subscription_id: subscriptionId || null,
      business_id: businessId || null,
      user_id: authUser.id,
    });
    if (!subscriptionId) {
      return json({ ok: false, error: 'subscriptionId is required' }, 400);
    }
    if (businessId) {
      await assertBusinessOwnership({ businessId, userId: authUser.id });
    }
    const localBefore = await getLocalSubscriptionRecord(subscriptionId);
    if (!localBefore && !businessId) {
      throw new HttpError(400, 'businessId is required when local subscription record is missing');
    }
    ensureRecordOwnership({ record: localBefore, authUserId: authUser.id });

    const result = await cancelSubscription({
      subscriptionId,
      reason: body?.reason || 'Cancelled by API request',
    });
    const local = await getLocalSubscriptionRecord(subscriptionId);
    ensureRecordOwnership({ record: local, authUserId: authUser.id });
    return json({ ok: true, result, local });
  } catch (err) {
    console.error('[PAYPAL_SUBSCRIPTION_CANCEL_ERROR]', {
      business_id: null,
      subscription_id: null,
      message: err?.message || 'unknown_error',
    });
    return handleControllerError(err, 'cancel_subscription_failed');
  }
}

