/**
 * Serverless function: sirve HTML con meta tags Open Graph dinámicos para /catalogo/:slug.
 * WhatsApp y otros crawlers no ejecutan JS; los meta deben estar en el HTML inicial (SSR).
 * Requiere: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY en el proyecto (Vercel env).
 */

import { createClient } from '@supabase/supabase-js';

const DEFAULT_DESCRIPTION = 'Revisa productos y haz tu pedido por WhatsApp.';

function escapeHtml(str) {
  if (str == null || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getOrigin(request) {
  const proto = request.headers.get('x-forwarded-proto') || request.headers.get('x-forwarded-protocol') || 'https';
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
  if (host) return `${proto}://${host}`.replace(/\/$/, '');
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`;
  return '';
}

function buildOgImageUrl(row, origin) {
  const ds = row?.design_settings || {};
  const logo = (row?.logo_url || ds?.logoUrl)?.trim();
  const cover = (row?.cover_image_url || ds?.headerImageUrl || ds?.coverImageUrl)?.trim();
  const toAbsolute = (url) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
  };
  if (logo) return toAbsolute(logo);
  if (cover) return toAbsolute(cover);
  const name = (row?.name || 'Catálogo').replace(/[^a-zA-Z0-9\s]/g, '').trim() || 'Catalogo';
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=7C3AED&color=fff&size=1200&format=png`;
}

/** GET: devuelve HTML con meta OG para el catálogo del slug. */
export async function GET(request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug')?.trim();
  if (!slug) {
    return new Response('Slug required', { status: 400 });
  }

  const origin = getOrigin(request);
  if (!origin) {
    return new Response('Origin unknown', { status: 500 });
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response('Missing Supabase config', { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data: row, error } = await supabase
    .from('wa_businesses')
    .select('id, name, description, slug, logo_url, cover_image_url, design_settings')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !row) {
    return new Response(null, { status: 404 });
  }

  const title = row.name || 'Catálogo';
  const description = (row.description && row.description.trim()) || DEFAULT_DESCRIPTION;
  const ogImage = buildOgImageUrl(row, origin);
  const catalogUrl = `${origin}/catalogo/${slug}`;

  const metaTags = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${escapeHtml(catalogUrl)}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:image" content="${escapeHtml(ogImage)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:locale" content="es_ES" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(ogImage)}" />`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<link rel="canonical" href="${escapeHtml(catalogUrl)}" />`,
  ].join('\n  ');

  let html;
  try {
    const indexUrl = `${origin}/index.html`;
    const res = await fetch(indexUrl, { headers: { 'Accept': 'text/html' } });
    if (!res.ok) throw new Error(`index.html ${res.status}`);
    html = await res.text();
  } catch (e) {
    return new Response(`Failed to load template: ${e.message}`, { status: 502 });
  }

  const injectBefore = '</head>';
  const insertIndex = html.indexOf(injectBefore);
  const injected = insertIndex !== -1
    ? html.slice(0, insertIndex) + '\n  ' + metaTags + '\n  ' + html.slice(insertIndex)
    : html;

  return new Response(injected, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  });
}
