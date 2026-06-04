/**
 * GET /api/domain-lookup?domain=www.mitienda.cl
 *
 * Resuelve un hostname personalizado al slug del negocio de Ventalink.
 * Consulta business_domains (status='active') → wa_businesses (is_active=true).
 * Usado por el SPA cuando carga en un dominio personalizado para navegar al catálogo correcto.
 *
 * Requiere: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from '@supabase/supabase-js';

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra },
  });
}

export async function GET(request) {
  const url = new URL(request.url);
  const domain = (url.searchParams.get('domain') || '').toLowerCase().split(':')[0].trim();

  if (!domain) {
    return json({ slug: null }, 400);
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[domain-lookup] Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return json({ slug: null }, 503);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: domainRecord, error } = await supabase
    .from('business_domains')
    .select('business_id')
    .eq('domain', domain)
    .eq('status', 'active')
    .maybeSingle();

  if (error) {
    console.error('[domain-lookup] DB error:', error.message);
    return json({ slug: null }, 500);
  }

  if (!domainRecord) {
    return json({ slug: null }, 404);
  }

  const { data: business } = await supabase
    .from('wa_businesses')
    .select('slug')
    .eq('id', domainRecord.business_id)
    .eq('is_active', true)
    .maybeSingle();

  if (!business?.slug) {
    return json({ slug: null }, 404);
  }

  return json(
    { slug: business.slug },
    200,
    { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
  );
}
