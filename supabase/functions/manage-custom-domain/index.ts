// manage-custom-domain — Add/verify custom domains via Vercel API.
// Requires env vars: VERCEL_TOKEN, VERCEL_PROJECT_ID
// Auth: requires valid JWT (authenticated users only).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function cleanDomain(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/\s/g, '');
}

/** Classify domain type for DNS instructions. */
function classifyDomain(domain: string): 'apex' | 'www' | 'subdomain' {
  const parts = domain.split('.');
  if (parts.length === 2) return 'apex';
  if (parts[0] === 'www') return 'www';
  return 'subdomain';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // Auth check
  const authHeader = req.headers.get('Authorization') || '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  );
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  // Vercel config
  const VERCEL_TOKEN = Deno.env.get('VERCEL_TOKEN') ?? '';
  const VERCEL_PROJECT_ID = Deno.env.get('VERCEL_PROJECT_ID') ?? '';
  if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID) {
    return json({ error: 'Vercel not configured (missing VERCEL_TOKEN or VERCEL_PROJECT_ID)' }, 500);
  }

  // Parse body
  let body: { action?: string; domain?: string; business_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const action = String(body?.action || '').trim();
  const rawDomain = String(body?.domain || '').trim();
  const businessId = String(body?.business_id || '').trim();

  const domain = cleanDomain(rawDomain);
  if (!domain) return json({ error: 'domain is required' }, 400);
  if (!businessId) return json({ error: 'business_id is required' }, 400);
  if (!['add', 'verify'].includes(action)) return json({ error: 'action must be add or verify' }, 400);

  // Verify the user owns this business
  const { data: biz } = await supabase
    .from('wa_businesses')
    .select('id')
    .eq('id', businessId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!biz) return json({ error: 'Business not found or access denied' }, 403);

  const vercelBase = `https://api.vercel.com`;
  const vercelHeaders = {
    'Authorization': `Bearer ${VERCEL_TOKEN}`,
    'Content-Type': 'application/json',
  };

  // ── ADD ─────────────────────────────────────────────────────────────────
  if (action === 'add') {
    // 1. Call Vercel to add the domain to the project
    const vercelRes = await fetch(
      `${vercelBase}/v10/projects/${VERCEL_PROJECT_ID}/domains`,
      {
        method: 'POST',
        headers: vercelHeaders,
        body: JSON.stringify({ name: domain }),
      }
    );
    const vercelData = await vercelRes.json();

    console.log('[manage-custom-domain] add', { domain, status: vercelRes.status, vercelData });

    if (!vercelRes.ok) {
      const errCode = vercelData?.error?.code || '';
      // domain_already_in_use is fine — it's already registered for this project
      if (errCode !== 'domain_already_in_use') {
        return json({
          ok: false,
          error: vercelData?.error?.message || `Vercel error (${vercelRes.status})`,
          vercel_code: errCode,
        }, 200);
      }
    }

    // 2. Upsert into business_domains
    const { error: dbError } = await supabase
      .from('business_domains')
      .upsert(
        { business_id: businessId, domain, status: 'pending' },
        { onConflict: 'business_id' }
      );

    if (dbError) {
      return json({ ok: false, error: `DB error: ${dbError.message}` }, 200);
    }

    const dnsType = classifyDomain(domain);
    return json({
      ok: true,
      domain,
      dns_type: dnsType,
      dns_instructions: buildDnsInstructions(domain, dnsType),
    });
  }

  // ── VERIFY ───────────────────────────────────────────────────────────────
  if (action === 'verify') {
    const vercelRes = await fetch(
      `${vercelBase}/v9/projects/${VERCEL_PROJECT_ID}/domains/${encodeURIComponent(domain)}`,
      { method: 'GET', headers: vercelHeaders }
    );
    const vercelData = await vercelRes.json();

    console.log('[manage-custom-domain] verify', { domain, status: vercelRes.status, vercelData });

    if (!vercelRes.ok) {
      await supabase
        .from('business_domains')
        .update({ status: 'error' })
        .eq('business_id', businessId)
        .eq('domain', domain);

      return json({
        ok: false,
        status: 'error',
        error: vercelData?.error?.message || `Vercel error (${vercelRes.status})`,
      });
    }

    // verified = true when DNS is configured correctly and Vercel has confirmed it
    const verified: boolean = vercelData?.verified === true;
    const newStatus = verified ? 'active' : 'pending';

    await supabase
      .from('business_domains')
      .update({ status: newStatus })
      .eq('business_id', businessId)
      .eq('domain', domain);

    return json({
      ok: true,
      domain,
      status: newStatus,
      verified,
      vercel_verification: vercelData?.verification ?? [],
      vercel_error: vercelData?.error ?? null,
    });
  }

  return json({ error: 'Unknown action' }, 400);
});

function buildDnsInstructions(domain: string, type: 'apex' | 'www' | 'subdomain') {
  if (type === 'apex') {
    return [{ type: 'A', host: '@', value: '76.76.21.21' }];
  }
  const host = domain.split('.')[0]; // e.g. "www" or "catalogo"
  return [{ type: 'CNAME', host, value: 'cname.vercel-dns.com' }];
}
