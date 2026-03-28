/**
 * Vercel Edge Middleware: injects Open Graph meta for catalog URLs when the
 * request is from a crawler (WhatsApp, Facebook, etc.) so the link preview
 * shows store-specific title, description and image without running the SPA.
 *
 * Google/Bing no están en la lista: reciben el HTML completo vía rewrite (catalog-html + SPA)
 * para indexación con meta y contenido coherentes.
 *
 * /cdn-cgi/*, imágenes y assets NO pasan por esta lógica (ver seoPassThrough.js).
 *
 * Requires in Vercel: SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY).
 */

import {
  detectCatalogRegion,
  getCatalogShareDescription,
  getCatalogShareDocumentTitle,
  resolveCatalogOgImageUrl,
} from './src/utils/catalogSeo.js';
import { getCatalogSlugFromPath } from './src/utils/seoPassThrough.js';
const BOT_UA =
  /(whatsapp|whatsappbot|facebookexternalhit|facebot|meta-externalagent|meta-externalfetcher|twitterbot|telegrambot|slackbot|discordbot|linkedinbot)/i;

function isBot(userAgent) {
  const ua = String(userAgent || '').trim();
  return BOT_UA.test(ua);
}

function getSupabaseConfig() {
  const url = (typeof process !== 'undefined' && (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)) || '';
  const key = (typeof process !== 'undefined' && (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY)) || '';
  return { url: url.replace(/\/$/, ''), key };
}

function buildOgHtml(payload) {
  const { title, description, ogImage, canonicalUrl, ogLocale } = payload;
  const escaped = (s) => String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const secure =
    ogImage && String(ogImage).startsWith('https://')
      ? `\n  <meta property="og:image:secure_url" content="${escaped(ogImage)}" />`
      : '';
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
  <meta property="og:image" content="${escaped(ogImage)}" />${secure}
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:locale" content="${escaped(ogLocale || 'es_CL')}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escaped(title)}" />
  <meta name="twitter:description" content="${escaped(description)}" />
  <meta name="twitter:image" content="${escaped(ogImage)}" />
  <link rel="canonical" href="${escaped(canonicalUrl)}" />
  <meta name="robots" content="index, follow" />
</head>
<body>
  <script>
    window.location.href = "${escaped(canonicalUrl)}";
  </script>
  <noscript>
    <p>Redirigiendo al catálogo...</p>
  </noscript>
</body>
</html>`;
}

export default async function middleware(request) {
  const url = new URL(request.url);

  const slug = getCatalogSlugFromPath(url.pathname);
  if (slug === null) {
    return;
  }

  const ua = request.headers.get('user-agent') || '';
  const bot = isBot(ua);

  if (!bot) {
    return;
  }

  const { url: supabaseUrl, key: supabaseKey } = getSupabaseConfig();
  const origin = url.origin;
  const pathClean = url.pathname.replace(/\/$/, '') || `/catalogo/${slug}`;
  const canonicalUrl = `${origin}${pathClean}`;

  const seoInput = {
    storeName: 'Catálogo',
    city: undefined,
    region: undefined,
    country: undefined,
    currency: undefined,
    host: url.host,
  };
  let catalogDescription = getCatalogShareDescription(null);
  let ogImage = resolveCatalogOgImageUrl(null, origin);
  try {
    if (supabaseUrl && supabaseKey) {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/wa_businesses?slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&select=name,description,slug,og_image_url,logo_url,cover_image_url,design_settings,city,region,country,country_code,currency,updated_at`,
        {
          headers: {
            Accept: 'application/json',
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
          },
        }
      );
      if (res.ok) {
        const data = await res.json();
        const row = Array.isArray(data) ? data[0] : data;
        if (row) {
          seoInput.storeName = row?.name || seoInput.storeName;
          seoInput.city = row?.city;
          seoInput.region = row?.region;
          seoInput.country = row?.country;
          seoInput.currency = row?.currency;
          seoInput.countryCode = row?.country_code;
          catalogDescription = getCatalogShareDescription(row);
          ogImage = resolveCatalogOgImageUrl(row, origin, { cacheBust: row?.updated_at });
          console.log(
            '[catalog-og-middleware]',
            JSON.stringify({
              slug,
              canonicalUrl,
              ogImage,
              title: getCatalogShareDocumentTitle(row?.name),
            }),
          );
        }
      }
    }
  } catch (_) {
    // Fallback silencioso: siempre responder HTML OG.
  }

  const pageTitle = getCatalogShareDocumentTitle(seoInput.storeName);
  const ri = detectCatalogRegion(seoInput);

  const html = buildOgHtml({
    title: pageTitle,
    description: catalogDescription,
    ogImage,
    canonicalUrl,
    ogLocale: ri.ogLocale,
  });

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export const config = {
  matcher: ['/catalogo/:path*', '/catalog/:path*'],
};
