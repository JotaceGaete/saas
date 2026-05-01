import {
  detectCatalogRegion,
  getCatalogOpenGraphImageUrl,
  getCatalogShareDescription,
  getCatalogShareDocumentTitle,
} from './src/utils/catalogSeo.js';
import { getCatalogSlugFromPath } from './src/utils/seoPassThrough.js';

// Dominio canónico público para catálogos. Debe coincidir con CATALOG_ORIGIN en appUrl.js y api/seo.js.
const CATALOG_ORIGIN = 'https://miralatienda.de';
const CF_MEDIA_HOST = 'media.gong.cl';

const BOT_UA =
  /(whatsapp|whatsappbot|facebookexternalhit|facebot|meta-externalagent|meta-externalfetcher|twitterbot|telegrambot|slackbot|discordbot|linkedinbot)/i;

function isBot(userAgent) {
  const ua = String(userAgent || '').trim();
  return BOT_UA.test(ua);
}

/** Tras `/cdn-cgi/image/<opciones>/`, la URL original suele empezar por `https://`. */
function extractOriginalUrlFromCfImagePath(pathname) {
  if (!pathname || !pathname.startsWith('/cdn-cgi/image/')) return null;
  const rest = pathname.slice('/cdn-cgi/image/'.length);
  const httpIdx = rest.indexOf('http');
  if (httpIdx === -1) return null;
  return rest.slice(httpIdx);
}

function isAllowedOgImageUpstreamUrl(u) {
  try {
    const h = new URL(u).hostname;
    return (
      h === CF_MEDIA_HOST ||
      h.endsWith('.r2.dev') ||
      h.endsWith('.r2.cloudflarestorage.com')
    );
  } catch {
    return false;
  }
}

function buildOgHtml(payload) {
  const {
    title,
    description,
    ogImage,
    canonicalUrl,
    ogLocale,
  } = payload;
  const escaped = (s) =>
    String(s || '')
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
  <meta name="twitter:url" content="${escaped(canonicalUrl)}" />
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const ua = request.headers.get('user-agent') || '';

    // WhatsApp: servir imagen original (JPEG/PNG) sin pasar por Image Resizing (WebP/format=auto).
    if (/WhatsApp/i.test(ua) && url.pathname.startsWith('/cdn-cgi/image/')) {
      const original = extractOriginalUrlFromCfImagePath(url.pathname);
      if (original && isAllowedOgImageUpstreamUrl(original)) {
        return fetch(original, {
          redirect: 'follow',
          headers: {
            Accept: 'image/jpeg,image/png,image/webp,image/*,*/*;q=0.8',
          },
        });
      }
    }

    const slug = getCatalogSlugFromPath(url.pathname);
    if (slug === null) {
      return fetch(request);
    }

    const bot = isBot(ua);

    if (!bot) {
      return fetch(request);
    }

    const supabaseUrl = (env?.SUPABASE_URL || '').replace(/\/$/, '');
    const supabaseKey = env?.SUPABASE_ANON_KEY || '';
    const origin = url.origin;
    const canonicalUrl = `${CATALOG_ORIGIN}/catalogo/${slug}`;

    const seoInput = {
      storeName: 'Catálogo',
      city: undefined,
      region: undefined,
      country: undefined,
      currency: undefined,
      host: url.host,
    };
    let catalogDescription = getCatalogShareDescription(null);
    let ogImage = getCatalogOpenGraphImageUrl(origin, slug, null);

    try {
      if (supabaseUrl && supabaseKey) {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/wa_businesses?slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&select=id,name,description,slug,og_image_url,logo_url,cover_image_url,design_settings,city,region,country,country_code,currency,updated_at`,
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
            ogImage = getCatalogOpenGraphImageUrl(origin, slug, row.updated_at);
            console.log(
              '[og-preview]',
              JSON.stringify({
                slug,
                ua,
                requestUrl: request.url,
                canonical: canonicalUrl,
                selectedImage: ogImage,
                queryStripped: Boolean(url.search && url.search.length > 1),
                source: 'worker',
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
  },
};
