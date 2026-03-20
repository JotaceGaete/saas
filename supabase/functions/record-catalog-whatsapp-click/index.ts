// record-catalog-whatsapp-click — registra clicks en acciones de WhatsApp del catálogo público.
// Público (verify_jwt = false).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  let body: { slug?: string; path?: string; source?: string; visitor_id?: string };
  try {
    body = (await req.json().catch(() => ({}))) as typeof body;
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const slug = typeof body?.slug === 'string' ? body.slug.trim() : '';
  if (!slug) return jsonResponse({ error: 'slug is required' }, 400);

  const path = typeof body?.path === 'string' ? body.path.trim() : null;
  const source = typeof body?.source === 'string' ? body.source.trim() || 'unknown' : 'unknown';
  const visitorId = typeof body?.visitor_id === 'string' ? body.visitor_id.trim() || null : null;
  const referrer = req.headers.get('referer') || req.headers.get('referrer') || null;
  const userAgent = req.headers.get('user-agent') || null;

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!serviceRoleKey) return jsonResponse({ error: 'Server configuration error' }, 500);

  const db = createClient(supabaseUrl, serviceRoleKey);
  const { data: biz, error: bizError } = await db
    .from('wa_businesses')
    .select('id')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  if (bizError || !biz?.id) return jsonResponse({ error: 'Catalog not found', recorded: false }, 404);

  const { error: insertErr } = await db.from('wa_catalog_whatsapp_clicks').insert({
    business_id: biz.id,
    slug,
    path,
    source,
    visitor_id: visitorId,
    referrer,
    user_agent: userAgent,
  });

  if (insertErr) {
    console.error('[record-catalog-whatsapp-click] insert error:', insertErr.message);
    return jsonResponse({ error: 'Failed to record click', recorded: false }, 500);
  }

  return jsonResponse({ recorded: true }, 200);
});

