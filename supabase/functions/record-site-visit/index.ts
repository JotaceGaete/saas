// record-site-visit — registra una visita al sitio principal de Ventalink.
// Público (verify_jwt = false). Sin throttle server-side; el cliente gestiona duplicados.

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

  let body: {
    path?: string;
    hostname?: string;
    visitor_id?: string;
    source?: string;
    referrer?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
  };

  try {
    body = (await req.json().catch(() => ({}))) as typeof body;
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const path        = typeof body?.path       === 'string' ? body.path.trim()       || '/' : '/';
  const hostname    = typeof body?.hostname   === 'string' ? body.hostname.trim()   || null : null;
  const visitorId   = typeof body?.visitor_id === 'string' ? body.visitor_id.trim() || null : null;
  const source      = typeof body?.source     === 'string' ? body.source.trim()     || null : null;
  const referrer    = typeof body?.referrer   === 'string' ? body.referrer.trim()   || null : null;
  const utmSource   = typeof body?.utm_source   === 'string' ? body.utm_source.trim()   || null : null;
  const utmMedium   = typeof body?.utm_medium   === 'string' ? body.utm_medium.trim()   || null : null;
  const utmCampaign = typeof body?.utm_campaign === 'string' ? body.utm_campaign.trim() || null : null;
  const userAgent   = req.headers.get('user-agent') || null;

  const supabaseUrl    = Deno.env.get('SUPABASE_URL')              ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!serviceRoleKey) return jsonResponse({ error: 'Server configuration error' }, 500);

  const db = createClient(supabaseUrl, serviceRoleKey);

  const { error: insertErr } = await db.from('wa_site_visits').insert({
    path,
    hostname,
    visitor_id:   visitorId,
    source,
    referrer,
    utm_source:   utmSource,
    utm_medium:   utmMedium,
    utm_campaign: utmCampaign,
    user_agent:   userAgent,
  });

  if (insertErr) {
    console.error('[record-site-visit] insert error:', insertErr.message);
    return jsonResponse({ error: 'Failed to record visit', recorded: false }, 500);
  }

  return jsonResponse({ recorded: true }, 200);
});
