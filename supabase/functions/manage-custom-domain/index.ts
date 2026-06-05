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

function classifyDomain(domain: string): 'apex' | 'www' | 'subdomain' {
  const parts = domain.split('.');
  if (parts.length === 2) return 'apex';
  if (parts[0] === 'www') return 'www';
  return 'subdomain';
}

/**
 * Build DNS instructions from Vercel's /v6/domains/{domain}/config response.
 * Falls back to known-good defaults when Vercel doesn't specify alternatives.
 */
function dnsFromVercelConfig(
  domain: string,
  configData: Record<string, unknown> | null,
): Array<{ type: string; host: string; value: string }> {
  const dnsType = classifyDomain(domain);
  const host = dnsType === 'apex' ? '@' : domain.split('.')[0];

  if (configData) {
    if (dnsType === 'apex') {
      // For apex, use Vercel's recommended A record(s)
      const aValues = Array.isArray(configData.aValues) ? configData.aValues as string[] : [];
      if (aValues.length > 0) {
        return aValues.map((v) => ({ type: 'A', host: '@', value: v }));
      }
    } else {
      // For subdomain/www, use Vercel's recommended CNAME target
      const cnames = Array.isArray(configData.cnames) ? configData.cnames as string[] : [];
      if (cnames.length > 0) {
        return [{ type: 'CNAME', host, value: cnames[0] }];
      }
    }
  }

  // Fallback to well-known Vercel defaults
  if (dnsType === 'apex') {
    return [{ type: 'A', host: '@', value: '76.76.21.21' }];
  }
  return [{ type: 'CNAME', host, value: 'cname.vercel-dns.com' }];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // Auth
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

  // Ownership check
  const { data: biz } = await supabase
    .from('wa_businesses')
    .select('id')
    .eq('id', businessId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!biz) return json({ error: 'Business not found or access denied' }, 403);

  const vercelBase = 'https://api.vercel.com';
  const vercelHeaders = {
    'Authorization': `Bearer ${VERCEL_TOKEN}`,
    'Content-Type': 'application/json',
  };

  // ── helpers ────────────────────────────────────────────────────────────────

  /** GET /v6/domains/{domain}/config — returns actual CNAME/A values Vercel expects. */
  async function fetchVercelDomainConfig(): Promise<Record<string, unknown> | null> {
    try {
      const r = await fetch(
        `${vercelBase}/v6/domains/${encodeURIComponent(domain)}/config`,
        { headers: vercelHeaders }
      );
      if (!r.ok) return null;
      return await r.json() as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  /** GET /v9/projects/{projectId}/domains/{domain} — current verification state. */
  async function fetchVercelProjectDomain(): Promise<Record<string, unknown> | null> {
    try {
      const r = await fetch(
        `${vercelBase}/v9/projects/${VERCEL_PROJECT_ID}/domains/${encodeURIComponent(domain)}`,
        { headers: vercelHeaders }
      );
      if (!r.ok) return null;
      return await r.json() as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  // ── ADD ────────────────────────────────────────────────────────────────────
  if (action === 'add') {
    // 1. Register domain in Vercel project
    const addRes = await fetch(
      `${vercelBase}/v10/projects/${VERCEL_PROJECT_ID}/domains`,
      {
        method: 'POST',
        headers: vercelHeaders,
        body: JSON.stringify({ name: domain }),
      }
    );
    const addData = await addRes.json() as Record<string, unknown>;
    console.log('[manage-custom-domain] POST domain', { domain, status: addRes.status, addData });

    if (!addRes.ok) {
      const errCode = String((addData?.error as Record<string, unknown>)?.code || '');
      if (errCode !== 'domain_already_in_use') {
        return json({
          ok: false,
          error: (addData?.error as Record<string, unknown>)?.message || `Vercel error (${addRes.status})`,
          vercel_code: errCode,
        });
      }
    }

    // 2. Fetch actual DNS config Vercel expects for this domain
    const [configData, projectDomain] = await Promise.all([
      fetchVercelDomainConfig(),
      fetchVercelProjectDomain(),
    ]);
    console.log('[manage-custom-domain] DNS config', { configData, projectDomain });

    const dnsInstructions = dnsFromVercelConfig(domain, configData);
    const vercelConfig = {
      dns_instructions: dnsInstructions,
      config: configData,
      project_domain: projectDomain,
      verification: (projectDomain?.verification as unknown[]) ?? (addData?.verification as unknown[]) ?? [],
      fetched_at: new Date().toISOString(),
    };

    // 3. Upsert business_domains with real DNS config
    const { error: dbError } = await supabase
      .from('business_domains')
      .upsert(
        { business_id: businessId, domain, status: 'pending', vercel_config: vercelConfig },
        { onConflict: 'business_id' }
      );

    if (dbError) {
      return json({ ok: false, error: `DB error: ${dbError.message}` });
    }

    return json({
      ok: true,
      domain,
      dns_instructions: dnsInstructions,
      vercel_config: vercelConfig,
    });
  }

  // ── VERIFY ─────────────────────────────────────────────────────────────────
  if (action === 'verify') {
    const [projectDomain, configData] = await Promise.all([
      fetchVercelProjectDomain(),
      fetchVercelDomainConfig(),
    ]);
    console.log('[manage-custom-domain] verify', { domain, projectDomain, configData });

    if (!projectDomain) {
      await supabase
        .from('business_domains')
        .update({ status: 'error' })
        .eq('business_id', businessId)
        .eq('domain', domain);
      return json({ ok: false, status: 'error', error: 'No se encontró el dominio en el proyecto Vercel.' });
    }

    const verified = projectDomain?.verified === true;
    const misconfigured = projectDomain?.misconfigured !== false;
    const newStatus: string = verified ? 'active' : 'pending';

    const dnsInstructions = dnsFromVercelConfig(domain, configData);
    const vercelConfig = {
      dns_instructions: dnsInstructions,
      config: configData,
      project_domain: projectDomain,
      verification: (projectDomain?.verification as unknown[]) ?? [],
      fetched_at: new Date().toISOString(),
    };

    await supabase
      .from('business_domains')
      .update({ status: newStatus, vercel_config: vercelConfig })
      .eq('business_id', businessId)
      .eq('domain', domain);

    return json({
      ok: true,
      domain,
      status: newStatus,
      verified,
      misconfigured,
      dns_instructions: dnsInstructions,
      vercel_config: vercelConfig,
      // Human-readable message when DNS isn't configured yet
      pending_message: !verified
        ? 'El dominio fue registrado correctamente en Vercel, pero aún falta configurar el registro DNS indicado abajo. Puede demorar hasta 48 h en propagarse.'
        : null,
    });
  }

  return json({ error: 'Unknown action' }, 400);
});
