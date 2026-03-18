/**
 * Resuelve el contexto de billing para la UI: región, proveedor, moneda.
 * Prioridad: 1) hostname (si es CL o AR para coherencia), 2) business.country_code, 3) user metadata, 4) fallback CL.
 */

import { getBillingRegion, getPaymentProvider, getCurrency } from './region';
import { BILLING_REGION_CL, BILLING_REGION_INT } from './constants';

/**
 * Normaliza código de país para resolución (solo códigos soportados).
 */
const SUPPORTED = new Set(['CL', 'AR', 'BO', 'BR', 'CO', 'CR', 'EC', 'ES', 'GT', 'MX', 'PA', 'PE', 'PY', 'US', 'UY']);

function normalize(code) {
  if (!code || typeof code !== 'string') return null;
  const c = code.toUpperCase().trim();
  return SUPPORTED.has(c) ? c : null;
}

/**
 * Resuelve el country code para billing según prioridad documentada.
 * @param {Object} opts
 * @param {string} [opts.hostnameCountryCode] - Del hostname (ej. getCountryCode() en frontend)
 * @param {string} [opts.businessCountryCode] - business.countryCode
 * @param {string} [opts.userCountryCode] - user.user_metadata?.country_code ?? user.user_metadata?.country
 * @returns {{ countryCode: string, region: 'CL'|'INT', provider: string, currency: string }}
 */
export function resolveBillingContext({ hostnameCountryCode, businessCountryCode, userCountryCode }) {
  const host = normalize(hostnameCountryCode);
  const biz = normalize(businessCountryCode);
  const usr = normalize(userCountryCode);

  // Prioridad: hostname (CL/AR) para coherencia; luego business; luego user.
  // En go.ventalink.app sin país (host null) no usar CL por defecto → AR (INT/USD/LemonSqueezy).
  let countryCode = 'CL';
  if (host === 'CL' || host === 'AR') countryCode = host;
  else if (biz) countryCode = biz;
  else if (usr) countryCode = usr;
  else if (host) countryCode = host;
  else countryCode = 'AR'; // go sin país: neutro (LemonSqueezy USD), no Chile

  const region = countryCode === 'CL' ? BILLING_REGION_CL : BILLING_REGION_INT;
  const provider = getPaymentProvider(countryCode);
  const currency = getCurrency(countryCode);

  return { countryCode, region, provider, currency };
}
