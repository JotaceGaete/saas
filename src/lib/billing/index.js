/**
 * Capa central de billing. Una sola fuente de verdad para:
 * - región (CL | INT)
 * - proveedor (mercado_pago | manual)
 * - moneda (CLP | USD)
 * - precios display por plan y región
 *
 * Regla: Chile → Mercado Pago, CLP. Resto → activación manual (USD referencia en UI).
 * No Paddle. No dLocal.
 */

export {
  BILLING_REGION_CL,
  BILLING_REGION_INT,
  PLAN_SLUGS_BILLING,
  PLAN_PRICES_BY_REGION,
  CURRENCY_BY_REGION,
  PROVIDER_BY_REGION,
} from './constants';

export { getBillingRegion, isChile, getPaymentProvider, getCurrency } from './region';
export { getPlanDisplayPrice, getPlanDisplayPriceByCountry } from './prices';
export { resolveBillingContext } from './resolve';
