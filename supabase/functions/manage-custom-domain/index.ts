/**
 * manage-custom-domain — Edge Function para gestión de dominios propios.
 *
 * POST  → Registra o reemplaza el dominio de un negocio y lo añade a Vercel.
 * DELETE → Elimina el dominio del negocio y lo quita de Vercel.
 * GET   → Consulta estado actual (también verifica en Vercel y actualiza BD).
 *
 * Auth: Bearer JWT de Supabase (anon key). Resuelve business por auth.uid().
 * Vars requeridas: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VERCEL_TOKEN, VERCEL_PROJECT_ID.
 * Var opcional: VERCEL_TEAM_ID.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Content-Type': 'application/json',
};

const ALLOWED_PLANS = ['pro', 'business'];

function getEffectivePlan(planSlug: string | null, planExpiresAt: string | null, trialExpiresAt: string | null): string {
  const slug = planSlug || 'starter';
  if (!ALLOWED_PLANS.includes(slug)) return 'starter';
  const now = new Date();
  if (planExpiresAt && new Date(planExpiresAt) > now) return slug;
  if (trialExpiresAt && new Date(trialExpiresAt) > now) return slug;
  if (!planExpiresAt && !trialExpiresAt) return slug; // legacy admin
  return 'starter';
}

function canUseDomain(effectivePlan: string): boolean {
  return ALLOWED_PLANS.includes(effectivePlan);
}

/** Normaliza y valida el dominio: lowercase, sin protocolo ni paths. */
function normalizeDomain(raw: string): { domain: string | null; error: string | null } {
  let d = raw.trim().toLowerCase();
  // Eliminar protocolo si lo pegaron
  d = d.replace(/^https?:\/\//i, '');
  // Eliminar path, query, hash
  d = d.split('/')[0].split('?')[0].split('#')[0];
  if (!d) return { domain: null, error: 'El dominio no puede estar vacío.' };
  // Validación básica de hostname
  const hostnameRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
  if (!hostnameRegex.test(d)) return { domain: null, error: 'Dominio inválido. Ejemplo válido: www.mitienda.cl' };
  // No permitir dominios propios de Ventalink
  const blocked = ['ventalink.app', 'miralatienda.de', 'vercel.app', 'supabase.co'];
  if (blocked.some(b => d === b || d.endsWith(`.${b}`))) {
    return { domain: null, error: 'No puedes usar un dominio de Ventalink.' };
  }
  return { domain: d, error: null };
}

async function vercelAddDomain(domain: string): Promise<{ ok: boolean; data: unknown; error: string | null }> {
  const token = Deno.env.get('VERCEL_TOKEN');
  const projectId = Deno.env.get('VERCEL_PROJECT_ID');
  const teamId = Deno.env.get('VERCEL_TEAM_ID');
  if (!token || !projectId) {
    console.warn('[manage-custom-domain] VERCEL_TOKEN or VERCEL_PROJECT_ID missing — skipping Vercel API call');
    return { ok: true, data: { skipped: true }, error: null };
  }
  const url = new URL(`https://api.vercel.com/v10/projects/${projectId}/domains`);
  if (teamId) url.searchParams.set('teamId', teamId);
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: domain }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as any)?.error?.message || `Vercel API error ${res.status}`;
    // 409 = domain already added → ok
    if (res.status === 409) return { ok: true, data, error: null };
    return { ok: false, data, error: msg };
  }
  return { ok: true, data, error: null };
}

async function vercelRemoveDomain(domain: string): Promise<void> {
  const token = Deno.env.get('VERCEL_TOKEN');
  const projectId = Deno.env.get('VERCEL_PROJECT_ID');
  const teamId = Deno.env.get('VERCEL_TEAM_ID');
  if (!token || !projectId) return;
  const url = new URL(`https://api.vercel.com/v10/projects/${projectId}/domains/${domain}`);
  if (teamId) url.searchParams.set('teamId', teamId);
  await fetch(url.toString(), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});
}

async function vercelGetDomainStatus(domain: string): Promise<unknown> {
  const token = Deno.env.get('VERCEL_TOKEN');
  const projectId = Deno.env.get('VERCEL_PROJECT_ID');
  const teamId = Deno.env.get('VERCEL_TEAM_ID');
  if (!token || !projectId) return null;
  const url = new URL(`https://api.vercel.com/v10/projects/${projectId}/domains/${domain}`);
  if (teamId) url.searchParams.set('teamId', teamId);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  // Auth: verificar JWT del usuario
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    return new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401, headers: corsHeaders });
  }

  const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Token inválido' }), { status: 401, headers: corsHeaders });
  }

  // Obtener el negocio del usuario autenticado
  const { data: business, error: bizError } = await adminClient
    .from('wa_businesses')
    .select('id, slug, plan_slug, plan_expires_at, trial_expires_at')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (bizError || !business) {
    return new Response(JSON.stringify({ error: 'Negocio no encontrado' }), { status: 404, headers: corsHeaders });
  }

  // Verificar plan
  const effectivePlan = getEffectivePlan(business.plan_slug, business.plan_expires_at, business.trial_expires_at);
  if (!canUseDomain(effectivePlan)) {
    return new Response(JSON.stringify({ error: 'Esta función requiere plan Pro o Business.', code: 'PLAN_GATE' }), { status: 403, headers: corsHeaders });
  }

  // ── GET: obtener estado del dominio (y verificar en Vercel) ──────────────────
  if (req.method === 'GET') {
    const { data: existing } = await adminClient
      .from('business_domains')
      .select('*')
      .eq('business_id', business.id)
      .maybeSingle();

    if (!existing) {
      return new Response(JSON.stringify({ domain: null }), { headers: corsHeaders });
    }

    // Consultar estado en Vercel
    const vercelData = await vercelGetDomainStatus(existing.domain);
    let newStatus = existing.status;
    if (vercelData) {
      const vd = vercelData as any;
      if (vd.verified === true) newStatus = 'active';
      else if (vd.error?.code === 'domain_not_found') newStatus = 'error';
      else newStatus = 'verifying';

      await adminClient.from('business_domains').update({
        status: newStatus,
        vercel_config: vercelData,
        last_checked_at: new Date().toISOString(),
      }).eq('id', existing.id);
    }

    return new Response(JSON.stringify({ ...existing, status: newStatus, vercel_config: vercelData ?? existing.vercel_config }), { headers: corsHeaders });
  }

  // ── POST: registrar/actualizar dominio ───────────────────────────────────────
  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}));
    const rawDomain = (body as any).domain ?? '';
    const { domain, error: validErr } = normalizeDomain(rawDomain);
    if (validErr || !domain) {
      return new Response(JSON.stringify({ error: validErr }), { status: 400, headers: corsHeaders });
    }

    // Comprobar que el dominio no esté registrado por otro negocio
    const { data: conflict } = await adminClient
      .from('business_domains')
      .select('id, business_id')
      .eq('domain', domain)
      .maybeSingle();

    if (conflict && conflict.business_id !== business.id) {
      return new Response(JSON.stringify({ error: 'Este dominio ya está registrado por otro negocio.' }), { status: 409, headers: corsHeaders });
    }

    // Llamar Vercel API para añadir el dominio al proyecto
    const { ok: vercelOk, data: vercelData, error: vercelErr } = await vercelAddDomain(domain);
    if (!vercelOk) {
      return new Response(JSON.stringify({ error: `Error al registrar en Vercel: ${vercelErr}` }), { status: 502, headers: corsHeaders });
    }

    // Upsert en business_domains
    const { data: saved, error: upsertErr } = await adminClient
      .from('business_domains')
      .upsert({
        business_id: business.id,
        domain,
        status: 'pending',
        vercel_config: vercelData,
        last_checked_at: new Date().toISOString(),
      }, { onConflict: 'business_id' })
      .select()
      .single();

    if (upsertErr) {
      return new Response(JSON.stringify({ error: 'Error al guardar el dominio.' }), { status: 500, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ ok: true, record: saved, domain }), { headers: corsHeaders });
  }

  // ── DELETE: eliminar dominio ─────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { data: existing } = await adminClient
      .from('business_domains')
      .select('id, domain')
      .eq('business_id', business.id)
      .maybeSingle();

    if (!existing) {
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    await vercelRemoveDomain(existing.domain);
    await adminClient.from('business_domains').delete().eq('id', existing.id);

    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
  }

  return new Response(JSON.stringify({ error: 'Método no soportado' }), { status: 405, headers: corsHeaders });
});
