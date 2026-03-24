import { requireAuthenticatedUser } from '../services/auth/requestAuthService.js';
import { assertBusinessOwnership } from '../services/billing/ownershipService.js';
import { getBillingSubscriptionState } from '../services/billing/subscriptionStateService.js';
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
  try {
    const authUser = await requireAuthenticatedUser(request);
    const url = new URL(request.url);
    const businessId = String(url.searchParams.get('businessId') || '').trim();
    if (!businessId) {
      return json({ ok: false, error: 'businessId query param is required' }, 400);
    }

    await assertBusinessOwnership({ businessId, userId: authUser.id });
    const businessCountryCode = await getBusinessCountryCodeById(businessId);
    assertMarketAccess({ requestUrl: request.url, businessCountryCode });
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
