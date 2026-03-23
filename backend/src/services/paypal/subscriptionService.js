import { paypalRequest } from '../../lib/paypal/httpClient.js';
import { getAccessToken } from './authService.js';
import { getPaypalPlanIdForInternalPlan } from '../billing/planMappingService.js';
import { getPaypalMode } from '../../config/paypal/index.js';
import { HttpError } from '../../lib/http/HttpError.js';
import {
  getSubscriptionRecordByPaypalId,
} from '../../repositories/paypalSubscriptionRepository.js';
import {
  applyCancelSnapshot,
  applyCreateSnapshot,
  applyRemoteSnapshot,
} from '../subscriptions/syncService.js';

function buildAuthHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Prefer: 'return=representation',
  };
}

function assertGoDomainUrl(urlValue, fieldName) {
  const raw = String(urlValue || '').trim();
  if (!raw) throw new HttpError(400, `[paypal-subscription] ${fieldName} is required`);

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, `[paypal-subscription] ${fieldName} must be a valid URL`);
  }

  const host = String(url.hostname || '').toLowerCase();
  const isGoDomain = host === 'go.ventalink.app' || host.endsWith('.go.ventalink.app');
  if (!isGoDomain) {
    throw new HttpError(400, `[paypal-subscription] ${fieldName} must use go.ventalink.app domain`);
  }
}

function buildCustomId({ userId, businessId }) {
  const user = String(userId || '').trim();
  const business = String(businessId || '').trim();
  if (!user && !business) {
    throw new HttpError(400, '[paypal-subscription] userId or businessId is required for custom_id');
  }
  if (business) return `business:${business}`;
  return `user:${user}`;
}

function extractApproveUrl(links) {
  if (!Array.isArray(links)) return null;
  const approve = links.find((item) => item?.rel === 'approve');
  return approve?.href || null;
}

function isValidEmail(email) {
  const value = String(email || '').trim();
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Crea suscripción en PayPal para plan interno pro/full.
 * Persistencia local se delega a syncService.
 */
export async function createSubscription({
  internalPlanSlug,
  userId,
  businessId,
  returnUrl,
  cancelUrl,
  subscriberEmail,
}) {
  const slug = String(internalPlanSlug || '').trim().toLowerCase();
  if (!slug) throw new HttpError(400, '[paypal-subscription] internalPlanSlug is required');
  if (slug === 'free' || slug === 'starter' || slug === 'control') {
    throw new HttpError(400, '[paypal-subscription] free/starter/control does not use PayPal subscriptions');
  }

  assertGoDomainUrl(returnUrl, 'returnUrl');
  assertGoDomainUrl(cancelUrl, 'cancelUrl');

  const paypalPlanId = await getPaypalPlanIdForInternalPlan(slug);
  if (!paypalPlanId) {
    throw new HttpError(400, `[paypal-subscription] no paypal_plan_id mapped for ${slug}`);
  }

  const customId = buildCustomId({ userId, businessId });
  const { accessToken } = await getAccessToken();

  const payload = {
    plan_id: paypalPlanId,
    custom_id: customId,
    application_context: {
      brand_name: 'Ventalink',
      return_url: String(returnUrl).trim(),
      cancel_url: String(cancelUrl).trim(),
      user_action: 'SUBSCRIBE_NOW',
      shipping_preference: 'NO_SHIPPING',
    },
  };

  const email = String(subscriberEmail || '').trim();
  if (email) {
    if (!isValidEmail(email)) {
      throw new HttpError(400, '[paypal-subscription] Invalid email format');
    }
    payload.subscriber = { email_address: email };
  }

  const response = await paypalRequest('/v1/billing/subscriptions', {
    method: 'POST',
    headers: buildAuthHeaders(accessToken),
    body: JSON.stringify(payload),
  });

  if (!response.ok || !response.body?.id) {
    const details = typeof response.body === 'string'
      ? response.body
      : JSON.stringify(response.body || {});
    throw new HttpError(503, `[paypal-subscription] create failed (${response.status}): ${details}`);
  }

  const result = {
    id: response.body.id,
    status: response.body.status || null,
    customId,
    paypalPlanId,
    approveUrl: extractApproveUrl(response.body.links),
    raw: response.body,
  };
  if (!result.approveUrl) {
    throw new HttpError(503, '[paypal-subscription] approve URL missing in PayPal response');
  }

  await applyCreateSnapshot({
    paypalSubscriptionId: result.id,
    paypalPlanId: result.paypalPlanId,
    internalPlanSlug: slug,
    status: result.status || 'APPROVAL_PENDING',
    customId: result.customId,
    userId: String(userId || '').trim() || null,
    businessId: String(businessId || '').trim() || null,
    approveUrl: result.approveUrl,
    subscriberEmail: email || null,
  });

  return result;
}

export async function getSubscription(subscriptionId) {
  const id = String(subscriptionId || '').trim();
  if (!id) throw new HttpError(400, '[paypal-subscription] subscriptionId is required');

  const { accessToken } = await getAccessToken();
  const response = await paypalRequest(`/v1/billing/subscriptions/${encodeURIComponent(id)}`, {
    method: 'GET',
    headers: buildAuthHeaders(accessToken),
  });

  if (!response.ok) {
    const details = typeof response.body === 'string'
      ? response.body
      : JSON.stringify(response.body || {});
    throw new HttpError(503, `[paypal-subscription] get failed (${response.status}): ${details}`);
  }

  const body = response.body || {};
  await applyRemoteSnapshot(body);

  return body;
}

export async function cancelSubscription({ subscriptionId, reason }) {
  const id = String(subscriptionId || '').trim();
  if (!id) throw new HttpError(400, '[paypal-subscription] subscriptionId is required');

  const { accessToken } = await getAccessToken();
  const payload = {
    reason: String(reason || 'Cancelled by Ventalink').trim(),
  };

  const response = await paypalRequest(`/v1/billing/subscriptions/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    headers: buildAuthHeaders(accessToken),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const details = typeof response.body === 'string'
      ? response.body
      : JSON.stringify(response.body || {});
    throw new HttpError(503, `[paypal-subscription] cancel failed (${response.status}): ${details}`);
  }

  await applyCancelSnapshot({
    paypalSubscriptionId: id,
    reason: payload.reason,
  });

  return {
    ok: true,
    subscriptionId: id,
  };
}

export async function getLocalSubscriptionRecord(subscriptionId) {
  const environment = getPaypalMode();
  return getSubscriptionRecordByPaypalId(environment, subscriptionId);
}

