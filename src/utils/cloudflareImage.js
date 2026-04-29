/**
 * URLs optimizadas vía Cloudflare Image Resizing (/cdn-cgi/image).
 * Solo transforma orígenes en media.gong.cl; el resto se devuelve igual (blobs, data:, relativas, otros hosts).
 *
 * El proxy DEBE apuntar a un hostname donde Image Resizing esté habilitado en el dashboard de Cloudflare.
 * No usar window.location.origin: subdominios de preview (p. ej. c1.ventalink.app) suelen devolver 403 en /cdn-cgi/image.
 *
 * Opcional: VITE_CF_IMAGE_ORIGIN=https://ventalink.app (o el host que tengáis configurado).
 */

/** @type {Record<'mobile'|'desktop'|'card'|'thumbnail', string>} */
export const CF_IMAGE_PROFILES = {
  mobile: 'width=600,quality=65,format=auto',
  desktop: 'width=1200,quality=80,format=auto',
  card: 'width=600,quality=75,format=auto',
  thumbnail: 'width=300,quality=60,format=auto',
};

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
 * @param {string} originalUrl
 * @param {'mobile'|'desktop'|'thumbnail'} [profile='thumbnail']
 * @returns {string}
 */
export function cfImageUrl(originalUrl, profile = 'thumbnail') {
  if (!isCfTransformableUrl(originalUrl)) return originalUrl;
  const opts = CF_IMAGE_PROFILES[profile] || CF_IMAGE_PROFILES.thumbnail;
  return `${getCfImageOrigin()}/cdn-cgi/image/${opts}/${originalUrl}`;
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
