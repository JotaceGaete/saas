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

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('wa_businesses')
    .select('id, user_id')
    .eq('id', bid)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, `[ownership] Failed to validate business ownership: ${error.message}`);
  }
  if (!data) {
    throw new HttpError(404, '[ownership] Business not found');
  }
  if (String(data.user_id || '') !== uid) {
    throw new HttpError(403, '[ownership] Forbidden: business does not belong to authenticated user');
  }
}

