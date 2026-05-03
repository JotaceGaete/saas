/**
 * URLs optimizadas vía Cloudflare Image Resizing (/cdn-cgi/image).
 * Solo transforma orígenes en media.gong.cl; el resto se devuelve igual (blobs, data:, relativas, otros hosts).
 *
 * El proxy DEBE apuntar a un hostname donde Image Resizing esté habilitado en el dashboard de Cloudflare.
 * No usar window.location.origin: subdominios de preview (p. ej. c1.ventalink.app) suelen devolver 403 en /cdn-cgi/image.
 *
 * Opcional: VITE_CF_IMAGE_ORIGIN=https://ventalink.app (o el host que tengáis configurado).
 */

/** @type {Record<'mobile'|'desktop'|'card'|'thumbnail'|'cover'|'coverMobile'|'coverDesktop'|'modal', string>} */
export const CF_IMAGE_PROFILES = {
  mobile: 'width=500,quality=75,format=auto',
  desktop: 'width=900,quality=80,format=auto',
  card: 'width=500,quality=75,format=auto',
  thumbnail: 'width=300,quality=60,format=auto',
  cover: 'width=1800,quality=88,format=auto',
  coverMobile: 'width=900,quality=82,format=auto',
  coverDesktop: 'width=1800,quality=88,format=auto',
  modal: 'width=1000,quality=80,format=auto',
};

const CF_IMAGE_PATH_MARKER = '/cdn-cgi/image/';

const MEDIA_HOST = 'media.gong.cl';

const DEFAULT_CF_IMAGE_ORIGIN = 'https://walinka.com';

const PRODUCTION_CF_HOSTS = new Set([
  'walinka.com',
  'go.ventalink.app',
  'ventalink.app',
  'www.ventalink.app',
]);

function getCfImageOrigin() {
  const env = import.meta.env?.VITE_CF_IMAGE_ORIGIN?.trim();
  if (env) return env.replace(/\/$/, '');
  if (typeof window !== 'undefined') {
    const h = (window.location.hostname || '').toLowerCase();
    if (PRODUCTION_CF_HOSTS.has(h) || h.endsWith('.ventalink.app')) {
      return window.location.origin.replace(/\/$/, '');
    }
  }
  return DEFAULT_CF_IMAGE_ORIGIN;
}

/**
 * @param {string} [url]
 * @returns {boolean}
 */
export function isCfTransformableUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const t = url.trim();
  if (t.startsWith('blob:') || t.startsWith('data:')) return false;
  if (t.startsWith('/')) return false;
  try {
    const u = new URL(t);
    if (u.protocol === 'file:') return false;
    return u.hostname === MEDIA_HOST;
  } catch {
    return false;
  }
}

/**
 * Si la URL ya viene transformada por Cloudflare (/cdn-cgi/image/...),
 * recupera la URL origen para poder re-aplicar un preset más apropiado.
 * @param {string} [url]
 * @returns {string | null}
 */
export function unwrapCfImageUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  const markerIndex = trimmed.indexOf(CF_IMAGE_PATH_MARKER);
  if (markerIndex === -1) return trimmed;

  const tail = trimmed.slice(markerIndex + CF_IMAGE_PATH_MARKER.length);
  const firstSlash = tail.indexOf('/');
  if (firstSlash === -1) return trimmed;

  const originalUrl = tail.slice(firstSlash + 1);
  return /^https?:\/\//i.test(originalUrl) ? originalUrl : trimmed;
}

/**
 * @param {string} originalUrl
 * @param {'mobile'|'desktop'|'card'|'thumbnail'|'cover'|'coverMobile'|'coverDesktop'|'modal'} [profile='thumbnail']
 * @returns {string}
 */
export function cfImageUrl(originalUrl, profile = 'thumbnail') {
  const sourceUrl = unwrapCfImageUrl(originalUrl) || originalUrl;
  if (!isCfTransformableUrl(sourceUrl)) return sourceUrl;
  const opts = CF_IMAGE_PROFILES[profile] || CF_IMAGE_PROFILES.thumbnail;
  return `${getCfImageOrigin()}/cdn-cgi/image/${opts}/${sourceUrl}`;
}

/**
 * Si /cdn-cgi/image falla (403, etc.), cargar la URL original en media.gong.cl.
 * @param {string} originalUrl
 * @returns {(e: React.SyntheticEvent<HTMLImageElement>) => void}
 */
export function buildCfImageErrorHandler(originalUrl) {
  return function handleCfImageError(e) {
    const el = e?.currentTarget;
    if (!el || !originalUrl || typeof originalUrl !== 'string') return;
    if (el.getAttribute('data-cf-fallback') === '1') return;
    if (!isCfTransformableUrl(originalUrl)) return;
    el.setAttribute('data-cf-fallback', '1');
    el.onerror = null;
    el.src = originalUrl;
  };
}
