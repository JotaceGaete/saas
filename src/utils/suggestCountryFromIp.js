import { COUNTRY_CODES } from '../config/countryConfig';

const SUPPORTED = new Set(COUNTRY_CODES);

/**
 * Mapea ISO 3166-1 alpha-2 (API IP) a un código del selector de go.ventalink.app.
 * Países soportados en lista → mismo código; resto → US (config internacional / USD en catálogo).
 */
export function mapIpCountryToSelectorSuggestion(isoCode) {
  const raw = (isoCode || '').toUpperCase().trim();
  if (!raw) return null;
  if (SUPPORTED.has(raw)) return { code: raw, approximate: false };
  return { code: 'US', approximate: true };
}

/**
 * Sugerencia por IP solo en go.ventalink.app. No escribe localStorage.
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<{ code: string, approximate: boolean } | null>}
 */
export async function fetchSuggestCountryFromIp(options = {}) {
  const timeoutMs = options.timeoutMs ?? 5000;
  if (typeof window === 'undefined') return null;
  const host = (window.location?.hostname || '').toLowerCase();
  if (!/(^|\.)go\.ventalink\.app$/.test(host)) return null;

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch('https://ip-api.com/json/?fields=status,message,countryCode', {
      signal: controller.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.status === 'fail') return null;
    return mapIpCountryToSelectorSuggestion(data?.countryCode);
  } catch {
    return null;
  }
}
