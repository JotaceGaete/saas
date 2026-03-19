const CATALOG_PATH = /^\/(catalogo|catalog)\/([^/]+)\/?$/;
const OG_FALLBACK_IMAGE = 'https://media.gong.cl/test/preview.jpg';
const BOT_UA =
  /(whatsapp|whatsappbot|facebookexternalhit|facebot|meta-externalagent|meta-externalfetcher|twitterbot|telegrambot|slackbot|discordbot|linkedinbot|googlebot|bingbot)/i;

function isBot(userAgent) {
  const ua = String(userAgent || '').trim();
  return BOT_UA.test(ua);
}

function parseDesignSettingsSafe(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function toAbsoluteUrl(url, origin) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return `${origin}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}

function getOgImageUrl(row, origin) {
  const ds = parseDesignSettingsSafe(row?.design_settings);
  const candidates = [
    row?.og_image_url,
    row?.cover_image_url,
    ds?.coverImageUrl,
    ds?.headerImageUrl,
    row?.logo_url,
    ds?.logoUrl,
  ];

  for (const candidate of candidates) {
    const absolute = toAbsoluteUrl(candidate, origin);
    if (absolute) return absolute;
  }

  return OG_FALLBACK_IMAGE;
}

function buildOgHtml(payload) {
  const { title, description, ogImage, canonicalUrl } = payload;
  const escaped = (s) =>
    String(s || '')
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
    const match = url.pathname.match(CATALOG_PATH);
    if (!match) return fetch(request);

    const slug = match[2];
    const ua = request.headers.get('user-agent') || '';
    const bot = isBot(ua);

    // DEBUG temporal
    console.log('[catalog-og-worker] request', {
      path: url.pathname,
      slug,
      userAgent: ua,
      isBot: bot,
    });

    // Requests no-bot: dejar pasar a la app normal
    if (!bot) {
      console.log('[catalog-og-worker] skip non-bot request', { slug });
      return fetch(request);
    }

    const supabaseUrl = (env?.SUPABASE_URL || '').replace(/\/$/, '');
    const supabaseKey = env?.SUPABASE_ANON_KEY || '';
    const origin = url.origin;
    const canonicalUrl = `${origin}/catalogo/${slug}`;

    let storeName = 'Catálogo';
    let catalogDescription = 'Revisa productos y haz tu pedido por WhatsApp.';
    let ogImage = OG_FALLBACK_IMAGE;

    try {
      if (supabaseUrl && supabaseKey) {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/wa_businesses?slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&select=name,description,slug,og_image_url,logo_url,cover_image_url,design_settings`,
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
            storeName = row?.name || storeName;
            if (typeof row?.description === 'string' && row.description.trim()) {
              catalogDescription = row.description.trim();
            }
            ogImage = getOgImageUrl(row, origin);
          }
        }
      }
    } catch (_) {
      // Fallback silencioso: siempre responder HTML OG.
    }

    console.log('[catalog-og-worker] bot branch response', {
      slug,
      imageUrl: ogImage,
    });

    const html = buildOgHtml({
      title: `Catálogo de ${storeName}`,
      description: catalogDescription,
      ogImage,
      canonicalUrl,
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

