/**
 * HTML inicial con meta SEO para la raíz de go.ventalink.app (landing internacional).
 */

import {
  GO_INTERNATIONAL_DESCRIPTION,
  GO_INTERNATIONAL_TITLE,
  buildGoInternationalJsonLd,
  getGoInternationalCanonical,
  getGoInternationalOgImage,
  stringifyJsonLd,
} from '../src/utils/goInternationalSeo.js';

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

export async function GET(request) {
  const origin = getOrigin(request);
  if (!origin) {
    return new Response('Origin unknown', { status: 500 });
  }

  const canonicalUrl = getGoInternationalCanonical(origin);
  const ogImage = getGoInternationalOgImage(origin);
  const title = GO_INTERNATIONAL_TITLE;
  const description = GO_INTERNATIONAL_DESCRIPTION;

  const jsonLd = buildGoInternationalJsonLd({ url: canonicalUrl });
  const jsonLdScript = `<script type="application/ld+json">${stringifyJsonLd(jsonLd)}</script>`;

  const metaTags = [
    `<meta name="robots" content="index, follow" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${escapeHtml(canonicalUrl)}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:image" content="${escapeHtml(ogImage)}" />`,
    `<meta property="og:locale" content="es" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(ogImage)}" />`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`,
    jsonLdScript,
  ].join('\n  ');

  let html;
  try {
    const indexUrl = `${origin}/index.html`;
    const res = await fetch(indexUrl, { headers: { Accept: 'text/html' } });
    if (!res.ok) throw new Error(`index.html ${res.status}`);
    html = await res.text();
  } catch (e) {
    return new Response(`Failed to load template: ${e.message}`, { status: 502 });
  }

  html = html.replace(/<html[^>]*>/i, '<html lang="es">');
  html = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(title)}</title>`);

  const injectBefore = '</head>';
  const insertIndex = html.indexOf(injectBefore);
  const injected =
    insertIndex !== -1
      ? html.slice(0, insertIndex) + '\n  ' + metaTags + '\n  ' + html.slice(insertIndex)
      : html;

  return new Response(injected, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600',
    },
  });
}
