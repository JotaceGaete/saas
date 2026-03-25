import { requireAuthenticatedUser } from '../services/auth/requestAuthService.js';
import { assertBusinessOwnership } from '../services/billing/ownershipService.js';
import { getBillingSubscriptionState } from '../services/billing/subscriptionStateService.js';
import { getCurrentSubscriptionState } from '../services/billing/currentSubscriptionService.js';
import { isHttpError } from '../lib/http/HttpError.js';
import { createClient } from '@supabase/supabase-js';
import { HttpError } from '../lib/http/HttpError.js';
import { assertMarketAccess } from '../services/market/marketValidationService.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getSupabaseUrl() {
  return String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
}

function getServiceRoleKey() {
  return String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

const SUB_STATE_ROUTE = 'GET /api/v1/billing/subscription-state';
const CURRENT_SUB_ROUTE = 'GET /api/v1/billing/current-subscription';

function truncateStack(stack, maxLines = 8) {
  if (!stack || typeof stack !== 'string') return null;
  return stack.split('\n').slice(0, maxLines).join('\n');
}

async function getBusinessCountryCodeById(businessId) {
  const url = getSupabaseUrl();
  const key = getServiceRoleKey();
  if (!url || !key) {
    throw new HttpError(503, '[billing-subscription-state] Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  const admin = createClient(url, key);
  const { data, error } = await admin
    .from('wa_businesses')
    .select('id, country_code')
    .eq('id', businessId)
    .maybeSingle();
  if (error) {
    throw new HttpError(503, `[billing-subscription-state] Business read failed: ${error.message}`);
  }
  if (!data) {
    throw new HttpError(404, '[billing-subscription-state] Business not found');
  }
  return data.country_code || null;
}

export async function getBillingSubscriptionStateController(request) {
  let businessId = null;
  let businessCountryCode = null;
  try {
    const authUser = await requireAuthenticatedUser(request);
    const url = new URL(request.url);
    const route = url.pathname || SUB_STATE_ROUTE;
    businessId = String(url.searchParams.get('businessId') || '').trim();
    if (!businessId) {
      return json({ ok: false, error: 'businessId query param is required' }, 400);
    }

    await assertBusinessOwnership({ businessId, userId: authUser.id });
    businessCountryCode = await getBusinessCountryCodeById(businessId);
    console.info('[billing-subscription-state] request', {
      route,
      businessId,
      businessCountryCode,
      hasSupabaseUrl: !!getSupabaseUrl(),
      hasServiceRoleKey: !!getServiceRoleKey(),
    });
    assertMarketAccess({ requestUrl: request.url, businessCountryCode });
    const state = await getBillingSubscriptionState({ businessId });
    return json(state, 200);
  } catch (err) {
    const message = String(err?.message || '');
    if (message.includes('[auth] Missing Bearer token') || message.includes('[auth] Invalid or expired user token')) {
      return json({ ok: false, code: 'AUTH_REQUIRED', error: message || '[auth] Unauthorized' }, 401);
    }
    if (isHttpError(err)) {
      const hint =
        /Missing SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY/i.test(err.message)
          ? 'Configura SUPABASE_URL (o VITE_SUPABASE_URL) y SUPABASE_SERVICE_ROLE_KEY en el entorno del API.'
          : /\[wa-subscriptions\] read failed/i.test(err.message)
            ? 'Revisa permisos de service role y existencia de la tabla wa_subscriptions.'
            : null;
      console.warn('[billing-subscription-state] http_error', {
        route: SUB_STATE_ROUTE,
        businessId,
        businessCountryCode,
        statusCode: err.statusCode,
        code: err?.code || null,
        error: err.message,
        details: err?.details || null,
        hint,
      });
      return json({
        ok: false,
        code: err?.code || null,
        provider: err?.provider || null,
        error: err.message,
        details: err?.details || null,
        ...(hint ? { hint } : {}),
      }, err.statusCode);
    }
    console.error('[billing-subscription-state] unhandled_error', {
      route: SUB_STATE_ROUTE,
      businessId,
      businessCountryCode,
      errName: err?.name,
      errMessage: err?.message,
      stack: truncateStack(err?.stack),
    });
    return json({
      ok: false,
      code: 'INTERNAL_OR_UNKNOWN',
      error: err?.message || 'subscription_state_failed',
      details: {
        name: err?.name || 'Error',
        message: String(err?.message || ''),
      },
    }, 503);
  }
}

export async function getCurrentSubscriptionController(request) {
  let businessId = null;
  let businessCountryCode = null;
  try {
    const authUser = await requireAuthenticatedUser(request);
    const url = new URL(request.url);
    const route = url.pathname || CURRENT_SUB_ROUTE;
    businessId = String(url.searchParams.get('businessId') || '').trim();
    if (!businessId) {
      return json({ ok: false, error: 'businessId query param is required' }, 400);
    }
    await assertBusinessOwnership({ businessId, userId: authUser.id });
    businessCountryCode = await getBusinessCountryCodeById(businessId);
    console.info('[billing-subscription-state] request', {
      route,
      businessId,
      businessCountryCode,
      hasSupabaseUrl: !!getSupabaseUrl(),
      hasServiceRoleKey: !!getServiceRoleKey(),
    });
    assertMarketAccess({ requestUrl: request.url, businessCountryCode });
    const result = await getCurrentSubscriptionState({ businessId });
    return json(result, 200);
  } catch (err) {
    const message = String(err?.message || '');
    if (message.includes('[auth] Missing Bearer token') || message.includes('[auth] Invalid or expired user token')) {
      return json({ ok: false, code: 'AUTH_REQUIRED', error: message || '[auth] Unauthorized' }, 401);
    }
    if (isHttpError(err)) {
      const hint =
        /Missing SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY/i.test(err.message)
          ? 'Configura SUPABASE_URL (o VITE_SUPABASE_URL) y SUPABASE_SERVICE_ROLE_KEY en el entorno del API.'
          : /\[wa-subscriptions\] read failed/i.test(err.message)
            ? 'Revisa permisos de service role y existencia de la tabla wa_subscriptions.'
            : null;
      console.warn('[billing-subscription-state] http_error', {
        route: CURRENT_SUB_ROUTE,
        businessId,
        businessCountryCode,
        statusCode: err.statusCode,
        code: err?.code || null,
        error: err.message,
        details: err?.details || null,
        hint,
      });
      return json({
        ok: false,
        code: err?.code || null,
        provider: err?.provider || null,
        error: err.message,
        details: err?.details || null,
        ...(hint ? { hint } : {}),
      }, err.statusCode);
    }
    console.error('[billing-subscription-state] unhandled_error', {
      route: CURRENT_SUB_ROUTE,
      businessId,
      businessCountryCode,
      errName: err?.name,
      errMessage: err?.message,
      stack: truncateStack(err?.stack),
    });
    return json({
      ok: false,
      code: 'INTERNAL_OR_UNKNOWN',
      error: err?.message || 'current_subscription_failed',
      details: {
        name: err?.name || 'Error',
        message: String(err?.message || ''),
      },
    }, 503);
  }
}
