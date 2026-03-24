import { HttpError } from '../../lib/http/HttpError.js';

function normalizeCountryCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return code || null;
}

export function getMarketCodeByCountry(countryCode) {
  const country = normalizeCountryCode(countryCode);
  if (country === 'CL') return 'CL';
  if (country === 'AR') return 'AR';
  return 'GLOBAL';
}

export function detectRequestMarketByUrl(urlString) {
  const host = String(new URL(urlString).hostname || '').trim().toLowerCase();
  if (/(^|\.)cl\.ventalink\.app$/.test(host)) return 'CL';
  if (/(^|\.)ar\.ventalink\.app$/.test(host)) return 'AR';
  if (/(^|\.)go\.ventalink\.app$/.test(host)) return 'GLOBAL';
  return 'GLOBAL';
}

export function assertMarketAccess({ requestUrl, businessCountryCode }) {
  const businessMarket = getMarketCodeByCountry(businessCountryCode);
  const requestMarket = detectRequestMarketByUrl(requestUrl);
  const mismatch = requestMarket !== 'GLOBAL' && businessMarket !== 'GLOBAL' && requestMarket !== businessMarket;
  if (!mismatch) return;
  throw new HttpError(409, '[market] Business belongs to a different market', {
    code: 'MARKET_MISMATCH',
    details: {
      businessMarket,
      requestMarket,
    },
  });
}
