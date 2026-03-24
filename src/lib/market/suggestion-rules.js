import { detectCurrentMarketByHostname } from './routing';
import { getManualMarketChoice } from '../../config/countryConfig';
import {
  isPairDismissed,
  preferenceMatchesCurrentMarket,
} from './suggestion-storage';

/**
 * Hosts de producción donde aplica la sugerencia (no preview local).
 */
export function isVentalinkMarketHost(hostname) {
  const h = String(hostname || '').trim().toLowerCase();
  return (
    /(^|\.)cl\.ventalink\.app$/.test(h) ||
    /(^|\.)ar\.ventalink\.app$/.test(h) ||
    /(^|\.)go\.ventalink\.app$/.test(h)
  );
}

/**
 * @param {object} p
 * @param {boolean} p.isAuthenticated
 * @param {string} p.hostname
 * @param {'CL'|'AR'|'GLOBAL'|null|undefined} p.detectedMarket - mercado inferido por país (borde/IP)
 * @param {string|null|undefined} p.countryIso
 * @returns {{ show: boolean, suggestedMarket?: 'CL'|'AR'|'GLOBAL', currentMarket?: 'CL'|'AR'|'GLOBAL', countryIso?: string|null }}
 */
export function computeMarketMismatchBanner({
  isAuthenticated,
  hostname,
  detectedMarket,
  countryIso,
}) {
  if (isAuthenticated) return { show: false };
  if (!isVentalinkMarketHost(hostname)) return { show: false };
  if (getManualMarketChoice()) return { show: false };
  if (detectedMarket == null) return { show: false };

  const currentMarket = detectCurrentMarketByHostname(hostname);
  if (detectedMarket === currentMarket) {
    return { show: false, suggestedMarket: detectedMarket, currentMarket, countryIso: countryIso ?? null };
  }
  if (preferenceMatchesCurrentMarket(currentMarket)) return { show: false };
  if (isPairDismissed(detectedMarket, currentMarket)) return { show: false };

  return {
    show: true,
    suggestedMarket: detectedMarket,
    currentMarket,
    countryIso: countryIso ?? null,
  };
}
