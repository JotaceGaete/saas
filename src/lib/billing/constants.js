/**
 * Constantes de billing. Una sola fuente de verdad para precios por región.
 * Regla: Chile (CL) → Mercado Pago, CLP. Resto (INT) → PayPal, USD.
 */

/** Regiones de facturación */
export const BILLING_REGION_CL = 'CL';
export const BILLING_REGION_INT = 'INT';

/** Slugs de plan internos (DB: starter, pro, business; "Full" = business) */
export const PLAN_SLUGS_BILLING = Object.freeze(['starter', 'pro', 'business']);

/**
 * Precios por región (solo planes de pago).
 * Chile: CLP/mes. Internacional: USD/mes.
 * Precios INT en USD para cobro con PayPal.
 */
export const PLAN_PRICES_BY_REGION = Object.freeze({
  [BILLING_REGION_CL]: {
    starter: 0,
    pro: 5990,
    business: 9990,
  },
  [BILLING_REGION_INT]: {
    starter: 0,
    pro: 6,
    business: 10,
  },
});

/** Moneda por región */
export const CURRENCY_BY_REGION = Object.freeze({
  [BILLING_REGION_CL]: 'CLP',
  [BILLING_REGION_INT]: 'USD',
});

/** Proveedor de pago por región */
export const PROVIDER_BY_REGION = Object.freeze({
  [BILLING_REGION_CL]: 'mercado_pago',
  [BILLING_REGION_INT]: 'paypal',
});
