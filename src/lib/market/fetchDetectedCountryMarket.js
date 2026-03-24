import { getMarketCodeByCountry } from './routing';

/**
 * Mercado inferido solo por país detectado (CL/AR/resto→GLOBAL). Para sugerencias, no negocio.
 */

async function fetchIpCountryIso() {
  if (typeof window === 'undefined') return null;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://ip-api.com/json/?fields=status,message,countryCode', {
      signal: controller.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.status === 'fail') return null;
    const code = data?.countryCode;
    return code && /^[A-Z]{2}$/i.test(String(code)) ? String(code).toUpperCase() : null;
  } catch {
    return null;
  }
}

/**
 * @returns {Promise<{ market: 'CL'|'AR'|'GLOBAL'|null, countryIso: string|null, source: 'edge'|'ip'|'none' }>}
 */
export async function fetchDetectedCountryMarket() {
  try {
    const r = await fetch('/api/client-country', { credentials: 'same-origin' });
    if (r.ok) {
      const j = await r.json();
      const iso = j?.country && /^[A-Z]{2}$/.test(String(j.country)) ? String(j.country).toUpperCase() : null;
      if (iso) {
        return {
          market: getMarketCodeByCountry(iso),
          countryIso: iso,
          source: j?.source === 'edge' ? 'edge' : 'unknown',
        };
      }
    }
  } catch {
    /* fall through */
  }

  const iso = await fetchIpCountryIso();
  if (iso) {
    return {
      market: getMarketCodeByCountry(iso),
      countryIso: iso,
      source: 'ip',
    };
  }

  return { market: null, countryIso: null, source: 'none' };
}
