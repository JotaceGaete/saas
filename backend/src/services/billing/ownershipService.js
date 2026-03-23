import { createClient } from '@supabase/supabase-js';
import { HttpError } from '../../lib/http/HttpError.js';

function getSupabaseUrl() {
  return String(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
}

function getServiceRoleKey() {
  return String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

function createAdminClient() {
  const url = getSupabaseUrl();
  const service = getServiceRoleKey();
  if (!url || !service) {
    throw new HttpError(500, '[ownership] Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, service);
}

export async function assertBusinessOwnership({ businessId, userId }) {
  const bid = String(businessId || '').trim();
  const uid = String(userId || '').trim();
  if (!bid || !uid) {
    throw new HttpError(400, '[ownership] businessId and userId are required');
  }

  console.info('[SUPABASE_ENV]', {
    url: process.env.SUPABASE_URL,
    has_service_role: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  console.info('[OWNERSHIP_CHECK_START]', {
    authenticated_user_id: uid,
    business_id: bid,
    query: "public.businesses where id = businessId and owner_id = authenticatedUser.id",
  });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('businesses')
    .select('id, owner_id')
    .eq('id', bid)
    .maybeSingle();

  console.info('[OWNERSHIP_RAW_DATA]', {
    data,
  });

  if (error) {
    console.error('[OWNERSHIP_CHECK_ERROR]', {
      authenticated_user_id: uid,
      business_id: bid,
      query: 'public.businesses(id, owner_id)',
      message: error.message,
    });
    throw new HttpError(500, `[ownership] Failed to validate business ownership: ${error.message}`);
  }
  if (!data) {
    console.warn('[OWNERSHIP_CHECK_NOT_FOUND]', {
      authenticated_user_id: uid,
      business_id: bid,
      query: 'public.businesses(id, owner_id)',
      result_found: false,
    });
    throw new HttpError(404, '[ownership] Business not found');
  }
  console.info('[OWNERSHIP_CHECK_RESULT]', {
    authenticated_user_id: uid,
    business_id: bid,
    query: 'public.businesses(id, owner_id)',
    result_found: true,
    result_owner_id: String(data.owner_id || '') || null,
  });
  if (String(data.owner_id || '') !== uid) {
    throw new HttpError(403, '[ownership] Forbidden: business does not belong to authenticated user');
  }
}

