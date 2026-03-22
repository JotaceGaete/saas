/**
 * URLs optimizadas vía Cloudflare Image Resizing (/cdn-cgi/image).
 * Solo transforma orígenes en media.gong.cl; el resto se devuelve igual (blobs, data:, relativas, otros hosts).
 *
 * El origen del proxy debe ser el mismo host que la app (cl/ar/go.ventalink.app), no el apex fijo:
 * pedir imágenes a otro host rompe con workers, reglas de zona o cookies en algunos despliegues.
 */

import { getAppBaseUrl } from '../config/appUrl';

function getCfImageOrigin() {
  // En el navegador: siempre el host actual (mismo build en cl/ar/go sin depender de VITE_APP_URL).
  if (typeof window !== 'undefined' && window.location?.origin) {
    return String(window.location.origin).replace(/\/$/, '');
  }
  const base = getAppBaseUrl();
  if (base) return base.replace(/\/$/, '');
  return 'https://ventalink.app';
}

/** @type {Record<'mobile'|'desktop'|'thumbnail', string>} */
export const CF_IMAGE_PROFILES = {
  mobile: 'width=600,quality=65,format=auto',
  desktop: 'width=1200,quality=80,format=auto',
  thumbnail: 'width=300,quality=60,format=auto',
};

const MEDIA_HOST = 'media.gong.cl';

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
