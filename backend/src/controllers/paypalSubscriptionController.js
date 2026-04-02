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

function logPaypalConfirmDebug(payload) {
  const {
    businessId = null,
    subscriptionId = null,
    hasAuth = false,
    userId = null,
    ownership = 'unknown',
    reason = 'none',
  } = payload || {};
  console.info(
    `[paypal-confirm-debug] businessId=${businessId || 'null'} subscriptionId=${subscriptionId || 'null'} hasAuth=${Boolean(hasAuth)} userId=${userId || 'null'} ownership=${ownership} reason=${reason}`,
  );
}

function extractBusinessIdFromCustomId(customId) {
  const raw = String(customId || '').trim();
  if (!raw.toLowerCase().startsWith('business:')) return null;
  const id = raw.slice('business:'.length).trim();
  return id || null;
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

export async function confirmPaypalSubscriptionController(request) {
  try {
    assertPaypalAllowedForRequest(request);
    const authHeader = String(request.headers.get('authorization') || '').trim();
    const hasAuth = authHeader.toLowerCase().startsWith('bearer ');
    const authUser = await requireAuthenticatedUser(request);
    const body = await readJsonBody(request);
    const subscriptionId = String(body?.subscriptionId || '').trim();
    let businessId = String(body?.businessId || '').trim();

    console.info('[PAYPAL_SUBSCRIPTION_CONFIRM_REQUEST]', {
      subscription_id: subscriptionId || null,
      business_id: businessId || null,
      user_id: authUser.id,
    });
    console.info(
      `[paypal-confirm-debug] received businessId=${businessId || 'null'} subscriptionId=${subscriptionId || 'null'} hasAuth=${hasAuth} reason=request_received`,
    );
    logPaypalConfirmDebug({
      businessId: businessId || null,
      subscriptionId: subscriptionId || null,
      hasAuth,
      userId: authUser.id,
      ownership: 'pending',
      reason: 'request_received',
    });

    if (!subscriptionId) {
      logPaypalConfirmDebug({
        businessId: businessId || null,
        subscriptionId: subscriptionId || null,
        hasAuth,
        userId: authUser.id,
        ownership: 'denied',
        reason: 'missing_subscription_id',
      });
      throw new HttpError(400, 'subscriptionId is required');
    }

    let businessOwnershipChecked = false;
    if (businessId) {
      await assertBusinessOwnership({ businessId, userId: authUser.id });
      businessOwnershipChecked = true;
      logPaypalConfirmDebug({
        businessId,
        subscriptionId,
        hasAuth: true,
        userId: authUser.id,
        ownership: 'allowed',
        reason: 'business_ownership_ok',
      });
    }

    let localBefore = await getLocalSubscriptionRecord(subscriptionId);
    if (!localBefore && !businessId) {
      const remoteForBusiness = await getSubscription(subscriptionId);
      const businessIdFromCustomId = extractBusinessIdFromCustomId(remoteForBusiness?.custom_id);
      if (businessIdFromCustomId) {
        businessId = businessIdFromCustomId;
        await assertBusinessOwnership({ businessId, userId: authUser.id });
        businessOwnershipChecked = true;
        logPaypalConfirmDebug({
          businessId,
          subscriptionId,
          hasAuth,
          userId: authUser.id,
          ownership: 'allowed',
          reason: 'business_id_resolved_from_paypal_custom_id',
        });
        localBefore = await getLocalSubscriptionRecord(subscriptionId);
      }
    }
    if (!localBefore && !businessId) {
      logPaypalConfirmDebug({
        businessId: null,
        subscriptionId,
        hasAuth,
        userId: authUser.id,
        ownership: 'denied',
        reason: 'missing_business_id_and_local_record',
      });
      throw new HttpError(400, 'businessId is required when local subscription record is missing');
    }
    try {
      ensureRecordOwnership({ record: localBefore, authUserId: authUser.id });
    } catch (err) {
      if (businessOwnershipChecked) {
        logPaypalConfirmDebug({
          businessId,
          subscriptionId,
          hasAuth: true,
          userId: authUser.id,
          ownership: 'allowed',
          reason: 'legacy_local_record_without_userid_using_business_ownership',
        });
      } else {
        logPaypalConfirmDebug({
          businessId: businessId || null,
          subscriptionId,
          hasAuth,
          userId: authUser.id,
          ownership: 'denied',
          reason: 'local_record_user_mismatch',
        });
        throw err;
      }
    }

    const remote = await getSubscription(subscriptionId);
    const local = await getLocalSubscriptionRecord(subscriptionId);
    try {
      ensureRecordOwnership({ record: local, authUserId: authUser.id });
    } catch (err) {
      if (!businessOwnershipChecked) {
        logPaypalConfirmDebug({
          businessId: businessId || null,
          subscriptionId,
          hasAuth,
          userId: authUser.id,
          ownership: 'denied',
          reason: 'post_sync_local_record_user_mismatch',
        });
        throw err;
      }
    }

    const paypalStatus = String(remote?.status || '').toUpperCase();
    logPaypalConfirmDebug({
      businessId: businessId || null,
      subscriptionId,
      hasAuth,
      userId: authUser.id,
      ownership: 'allowed',
      reason: `confirmed_${paypalStatus || 'UNKNOWN'}`,
    });
    // /confirm es lectura remota (PayPal API) únicamente.
    // La escritura en billing_subscriptions la realiza el webhook BILLING.SUBSCRIPTION.ACTIVATED.
    return json({
      ok: true,
      subscriptionId,
      paypalStatus: remote?.status || null,
      local,
      remote,
    });
  } catch (err) {
    logPaypalConfirmDebug({
      businessId: null,
      subscriptionId: null,
      hasAuth: false,
      userId: null,
      ownership: 'denied',
      reason: err?.message || 'unknown_error',
    });
    console.error('[PAYPAL_SUBSCRIPTION_CONFIRM_ERROR]', {
      business_id: null,
      subscription_id: null,
      message: err?.message || 'unknown_error',
    });
    return handleControllerError(err, 'confirm_subscription_failed');
  }
}

