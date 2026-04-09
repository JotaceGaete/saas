// record-catalog-visit — registra una visita al catálogo público.
// Público (verify_jwt = false). Anti-duplicado: mismo visitor_id + negocio en 30 min no se vuelve a contar.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const THROTTLE_MINUTES = 30;

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  let body: { slug?: string; path?: string; visitor_id?: string; source?: string; referrer?: string; utm_source?: string };
  try {
    body = (await req.json().catch(() => ({}))) as typeof body;
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const slug = typeof body?.slug === 'string' ? body.slug.trim() : '';
  if (!slug) {
    return jsonResponse({ error: 'slug is required' }, 400);
  }

  const path = typeof body?.path === 'string' ? body.path.trim() : null;
  const visitorId = typeof body?.visitor_id === 'string' ? body.visitor_id.trim() || null : null;
  const source = typeof body?.source === 'string' ? body.source.trim() || null : null;
  const referrer = typeof body?.referrer === 'string' ? body.referrer.trim() || null
    : req.headers.get('referer') || req.headers.get('referrer') || null;
  const utmSource = typeof body?.utm_source === 'string' ? body.utm_source.trim() || null : null;
  const userAgent = req.headers.get('user-agent') || null;

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!serviceRoleKey) {
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }

  const db = createClient(supabaseUrl, serviceRoleKey);

  const { data: biz, error: bizError } = await db
    .from('wa_businesses')
    .select('id')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  if (bizError || !biz?.id) {
    console.log('[record-catalog-visit] business not found for slug:', slug);
    return jsonResponse({ error: 'Catalog not found', recorded: false }, 404);
  }

  const businessId = biz.id;

  if (visitorId) {
    const since = new Date(Date.now() - THROTTLE_MINUTES * 60 * 1000).toISOString();
    const { data: recent } = await db
      .from('wa_catalog_visits')
      .select('id')
      .eq('business_id', businessId)
      .eq('visitor_id', visitorId)
      .gte('created_at', since)
      .limit(1);
    if (recent && recent.length > 0) {
      console.log('[record-catalog-visit] throttled', { slug, visitorId: visitorId.slice(0, 8) });
      return jsonResponse({ recorded: false, reason: 'throttled' }, 200);
    }
  }

  const { error: insertErr } = await db.from('wa_catalog_visits').insert({
    business_id: businessId,
    slug,
    path,
    visitor_id: visitorId,
    source,
    referrer,
    utm_source: utmSource,
    user_agent: userAgent,
  });

  if (insertErr) {
    console.error('[record-catalog-visit] insert error:', insertErr.message);
    return jsonResponse({ error: 'Failed to record visit', recorded: false }, 500);
  }

  return jsonResponse({ recorded: true }, 200);
});
