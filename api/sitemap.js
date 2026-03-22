/**
 * Sitemap XML con todas las URLs /catalogo/:slug (negocios activos).
 */

import { createClient } from '@supabase/supabase-js';

function getHost(request) {
  return request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
}

function getOrigin(request) {
  const proto = request.headers.get('x-forwarded-proto') || request.headers.get('x-forwarded-protocol') || 'https';
  const host = getHost(request);
  if (host) return `${proto}://${host}`.replace(/\/$/, '');
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`;
  return (process.env.VITE_APP_URL || '').replace(/\/$/, '') || '';
}

function escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET(request) {
  const origin = getOrigin(request);
  if (!origin) {
    return new Response('Origin unknown', { status: 500 });
  }

  const host = getHost(request);
  const isGoIntl = /(^|\.)go\.ventalink\.app$/i.test(host);

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response('Missing Supabase config', { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data: rows, error } = await supabase
    .from('wa_businesses')
    .select('slug, updated_at')
    .eq('is_active', true)
    .not('slug', 'is', null);

  if (error) {
    return new Response(`Sitemap error: ${error.message}`, { status: 500 });
  }

  const urls = (rows || [])
    .map((r) => {
      const slug = (r.slug || '').trim();
      if (!slug) return null;
      const loc = `${origin}/catalogo/${slug}`;
      let lastmod = '';
      if (r.updated_at) {
        try {
          lastmod = new Date(r.updated_at).toISOString().split('T')[0];
        } catch (_) {
          lastmod = '';
        }
      }
      return { loc, lastmod };
    })
    .filter(Boolean);

  const catalogUrls = urls
    .map(({ loc, lastmod }) => {
      const lm = lastmod ? `\n    <lastmod>${escapeXml(lastmod)}</lastmod>` : '';
      return `  <url>
    <loc>${escapeXml(loc)}</loc>${lm}
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
    })
    .join('\n');

  const homeUrl = isGoIntl
    ? `  <url>
    <loc>${escapeXml(`${origin}/`)}</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>`
    : '';

  const blocks = [homeUrl, catalogUrls].filter(Boolean).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${blocks}
</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
