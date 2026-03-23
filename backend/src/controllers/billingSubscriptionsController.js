import { createClient } from '@supabase/supabase-js';
import { HttpError, isHttpError } from '../lib/http/HttpError.js';
import { requireAuthenticatedUser } from '../services/auth/requestAuthService.js';
import { assertBusinessOwnership } from '../services/billing/ownershipService.js';
import { confirmBillingSubscription, createBillingSubscription } from '../services/billing/billingSubscriptionService.js';

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

function getSupabaseUrl() {
  return String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
}

function getServiceRoleKey() {
  return String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

function getAdminClient() {
  const url = getSupabaseUrl();
  const key = getServiceRoleKey();
  if (!url || !key) {
    throw new HttpError(503, '[billing-subscriptions] Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key);
}

async function getBusinessById(businessId) {
  const client = getAdminClient();
  const { data, error } = await client
    .from('wa_businesses')
    .select('id, user_id, country_code, plan_slug, trial_expires_at')
    .eq('id', businessId)
    .maybeSingle();
  if (error) throw new HttpError(503, `[billing-subscriptions] Business read failed: ${error.message}`);
  if (!data) throw new HttpError(404, '[billing-subscriptions] Business not found');
  return data;
}

function handleError(err, fallbackMessage) {
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
  return json({ ok: false, error: err?.message || fallbackMessage }, 503);
}

export async function createBillingSubscriptionController(request) {
  try {
    const authUser = await requireAuthenticatedUser(request);
    const body = await readJsonBody(request);
    const businessId = String(body?.businessId || '').trim();
    const planSlug = String(body?.planSlug || '').trim().toLowerCase();
    const provider = String(body?.provider || '').trim().toLowerCase() || null;
    if (!businessId) throw new HttpError(400, 'businessId is required');
    if (!planSlug) throw new HttpError(400, 'planSlug is required');

    await assertBusinessOwnership({ businessId, userId: authUser.id });
    const business = await getBusinessById(businessId);

    const returnUrl = String(body?.returnUrl || `${new URL(request.url).origin}/billing/payments/success`).trim();
    const cancelUrl = String(body?.cancelUrl || `${new URL(request.url).origin}/billing/payments/cancel`).trim();

    const result = await createBillingSubscription({
      business,
      authUser,
      planSlug,
      provider,
      returnUrl,
      cancelUrl,
    });
    console.info('[BILLING_CREATE_RESULT]', {
      route: '/api/v1/billing/subscriptions/create',
      businessId,
      planSlug,
      requestedProvider: provider || null,
      selectedProvider: result?.provider || null,
      countryCode: business?.country_code || null,
      status: 'ok',
    });
    return json(result, 200);
  } catch (err) {
    console.error('[BILLING_CREATE_ERROR]', {
      route: '/api/v1/billing/subscriptions/create',
      message: err?.message || 'unknown_error',
      code: err?.code || null,
      provider: err?.provider || null,
      details: err?.details || null,
    });
    return handleError(err, 'create_billing_subscription_failed');
  }
}

export async function confirmBillingSubscriptionController(request) {
  try {
    const authUser = await requireAuthenticatedUser(request);
    const body = await readJsonBody(request);
    const businessId = String(body?.businessId || '').trim();
    if (!businessId) throw new HttpError(400, 'businessId is required');
    await assertBusinessOwnership({ businessId, userId: authUser.id });
    const result = await confirmBillingSubscription({ businessId });
    return json(result, 200);
  } catch (err) {
    return handleError(err, 'confirm_billing_subscription_failed');
  }
}
