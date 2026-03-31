import { PAYMENT_PROVIDERS, normalizeBillingProvider } from './providers';

function normalizeProvider(provider) {
  return normalizeBillingProvider(provider) || String(provider || '').trim().toLowerCase();
}

/**
 * @param {{ provider: string, marketCode?: string, billingCountryCode?: string }} opts
 * `billingCountryCode` preferido (país del negocio); `marketCode` solo compatibilidad.
 */
export function getProviderDisplayLabel({ provider, marketCode, billingCountryCode }) {
  const p = normalizeProvider(provider);
  if (p === PAYMENT_PROVIDERS.MERCADO_PAGO) return 'Pagar con Mercado Pago';
  if (p === PAYMENT_PROVIDERS.PAYPAL) return 'Pagar con PayPal';
  if (p === PAYMENT_PROVIDERS.MANUAL) return 'Solicitar activación';
  return 'Continuar';
}

export function getProviderShortLabel({ provider, marketCode, billingCountryCode }) {
  const p = normalizeProvider(provider);
  if (p === PAYMENT_PROVIDERS.MERCADO_PAGO) return 'Mercado Pago';
  if (p === PAYMENT_PROVIDERS.PAYPAL) return 'PayPal';
  return String(provider || '');
}

export function getPaymentSummaryCopy({ provider }) {
  const p = normalizeProvider(provider);
  if (p === PAYMENT_PROVIDERS.MERCADO_PAGO) return 'Para este negocio, Mercado Pago es el método principal.';
  if (p === PAYMENT_PROVIDERS.PAYPAL) return 'Para este negocio, PayPal está disponible como alternativa.';
  if (p === PAYMENT_PROVIDERS.MANUAL) return 'La activación por contacto directo está disponible para este mercado.';
  return 'Consulta disponibilidad de pago en tu país.';
}

export function getMarketNoticeCopy({ marketCode, billingCountryCode }) {
  const iso = billingCountryCode || (marketCode === 'AR' ? 'AR' : null);
  if (iso === 'AR') return 'Mercado Pago pronto disponible.';
  return null;
}

export function getPlanUnavailableCopy() {
  return 'Próximamente disponible en tu país';
}
