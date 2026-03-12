/**
 * Vercel Edge Middleware: injects Open Graph meta for catalog URLs when the
 * request is from a crawler (WhatsApp, Facebook, etc.) so the link preview
 * shows store-specific title, description and image without running the SPA.
 *
 * Requires in Vercel: SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY).
 */

const BOT_UA =
  /whatsapp|facebookexternalhit|facebot|twitterbot|telegram|slurp|linkedinbot|embed|googlebot|bingbot|duckduckbot|pinterest|slackbot|discordbot/i;

const CATALOG_PATH = /^\/(catalogo|catalog)\/([^/]+)\/?$/;

function getSupabaseConfig() {
  const url = (typeof process !== 'undefined' && (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)) || '';
  const key = (typeof process !== 'undefined' && (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY)) || '';
  return { url: url.replace(/\/$/, ''), key };
}

function getOgImageUrl(row, origin) {
  const ds = row?.design_settings || {};
  const logo = row?.logo_url || ds?.logoUrl || null;
  const cover = row?.cover_image_url || ds?.headerImageUrl || ds?.coverImageUrl || null;
  if (logo && logo.trim()) return logo.startsWith('http') ? logo : `${origin}${logo.startsWith('/') ? '' : '/'}${logo}`;
  if (cover && cover.trim()) return cover.startsWith('http') ? cover : `${origin}${cover.startsWith('/') ? '' : '/'}${cover}`;
  const name = (row?.name || 'Catálogo').replace(/[^a-zA-Z0-9\s]/g, '').trim() || 'Catalogo';
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=7C3AED&color=fff&size=1200&format=png`;
}

function buildOgHtml(payload) {
  const { title, description, ogImage, canonicalUrl } = payload;
  const escaped = (s) => String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escaped(title)}</title>
  <meta name="description" content="${escaped(description)}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${escaped(canonicalUrl)}" />
  <meta property="og:title" content="${escaped(title)}" />
  <meta property="og:description" content="${escaped(description)}" />
  <meta property="og:image" content="${escaped(ogImage)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:locale" content="es_ES" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escaped(title)}" />
  <meta name="twitter:description" content="${escaped(description)}" />
  <meta name="twitter:image" content="${escaped(ogImage)}" />
  <link rel="canonical" href="${escaped(canonicalUrl)}" />
  <meta http-equiv="refresh" content="0;url=${escaped(canonicalUrl)}" />
</head>
<body><p>Redirigiendo al catálogo...</p></body>
</html>`;
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const match = url.pathname.match(CATALOG_PATH);
  if (!match) return;

  const slug = match[2];
  const ua = request.headers.get('user-agent') || '';
  if (!BOT_UA.test(ua)) return;

  const { url: supabaseUrl, key: supabaseKey } = getSupabaseConfig();
  if (!supabaseUrl || !supabaseKey) {
    return;
  }

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/wa_businesses?slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&select=name,slug,logo_url,cover_image_url,design_settings`,
      {
        headers: {
          Accept: 'application/json',
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      }
    );
    if (!res.ok) return;

    const data = await res.json();
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !row.name) return;

    const origin = url.origin;
    const storeName = row.name || 'Catálogo';
    const catalogTitle = `Catálogo de ${storeName}`;
    const catalogDescription = 'Revisa productos y haz tu pedido por WhatsApp.';
    const canonicalUrl = `${origin}/catalogo/${slug}`;
    const ogImage = getOgImageUrl(row, origin);

    const html = buildOgHtml({
      title: catalogTitle,
      description: catalogDescription,
      ogImage,
      canonicalUrl,
    });

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300, s-maxage=300',
      },
    });
  } catch (_) {
    return;
  }
}

export const config = {
  matcher: ['/catalogo/:path*', '/catalog/:path*'],
};
