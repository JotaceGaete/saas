/**
 * Evita que la lógica SEO (Open Graph / bots) actúe sobre:
 * - /cdn-cgi/* (Cloudflare Image Resizing y otros)
 * - assets y rutas típicas de build
 * - URLs con extensión de archivo estático
 *
 * Usado en middleware (Vercel) y worker (Cloudflare).
 */

const STATIC_EXT =
  /\.(jpg|jpeg|png|webp|gif|svg|ico|avif|woff2?|ttf|eot|css|js|mjs|map|json|xml|txt|mp4|webm|pdf)$/i;

/**
 * @param {string} pathname
 * @returns {boolean} true = no aplicar SEO; dejar pasar la petición tal cual
 */
export function shouldPassThroughSeo(pathname) {
  if (!pathname || typeof pathname !== 'string') return true;
  const p = pathname.startsWith('/') ? pathname : `/${pathname}`;

  if (p.startsWith('/cdn-cgi/')) return true;
  if (p.startsWith('/_next/')) return true;
  if (p.startsWith('/assets/')) return true;
  if (p.startsWith('/static/')) return true;

  if (STATIC_EXT.test(p)) return true;

  return false;
}

/**
 * Solo la página HTML pública del catálogo: /catalogo/:slug o /catalog/:slug (un segmento, opcional / final).
 * No coincide con /catalogo/foo/bar ni con archivos.
 * @param {string} pathname
 */
export function isCatalogPublicHtmlPath(pathname) {
  if (shouldPassThroughSeo(pathname)) return false;
  return /^\/(catalogo|catalog)\/[^/]+\/?$/.test(pathname);
}

/**
 * @param {string} pathname
 * @returns {string|null} slug o null
 */
export function getCatalogSlugFromPath(pathname) {
  if (!isCatalogPublicHtmlPath(pathname)) return null;
  const m = pathname.match(/^\/(?:catalogo|catalog)\/([^/]+)\/?$/);
  return m ? m[1] : null;
}
