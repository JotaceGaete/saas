/**
 * walinkaMarketplaceFee.ts — cálculo server-side de la comisión Walinka
 * (Split Payments 1:1 de Mercado Pago, `marketplace_fee`) sobre el
 * checkout de catálogo DEL COMERCIO (MP-MARKETPLACE-1).
 *
 * marketplace_fee es la comisión de PLATAFORMA descontada de la
 * liquidación del VENDEDOR -- NUNCA un recargo al comprador, que sigue
 * pagando exactamente el mismo total (ver create-merchant-mp-checkout/
 * lib.ts buildPreferencePayload: este valor nunca se suma a items/
 * subtotal/total/unit_price).
 *
 * Compartida por dos llamadores:
 *   - create-merchant-mp-checkout: calcula el fee que se envía a
 *     Mercado Pago al crear la preferencia, sobre totals.totalCents
 *     (recién recalculado desde wa_products.price, nunca del body).
 *   - merchant-mp-webhook: RE-calcula el MISMO fee de forma
 *     determinista a partir de wa_orders.total_amount/currency para
 *     persistirlo -- nunca confía en un valor de marketplace_fee que
 *     pudiera venir en la respuesta de Mercado Pago.
 * En ambos casos el total SIEMPRE llega ya resuelto desde DB por el
 * llamador -- esta función es pura, no consulta nada ni toca Deno.env.
 *
 * Aritmética: recibe el total en CENTAVOS enteros (misma convención de
 * toCents/fromCents ya usada en create-merchant-mp-checkout/lib.ts y
 * merchant-mp-webhook/lib.ts) para evitar drift de punto flotante.
 * CLP y ARS se redondean en bases DISTINTAS a propósito -- regla de
 * negocio explícita, no un accidente de implementación:
 *   - CLP no tiene sub-unidad práctica en Mercado Pago: el 1% se
 *     redondea al PESO entero más cercano (Math.round sobre el monto
 *     en pesos, no en centavos).
 *   - ARS sí tiene 2 decimales: el 1% se redondea al CENTAVO más
 *     cercano (Math.round sobre totalCents).
 * Siempre Math.round estándar (half-up para valores positivos) -- la
 * misma convención que ya usan toCents/fromCents/amountsMatch en el
 * resto de MP-CHECKOUT. Nunca redondeo bancario.
 */

// 100 bps = 1%. Único lugar donde vive el porcentaje de la comisión --
// nunca aceptado desde el frontend, nunca leído de una tabla editable
// por el comerciante ni por el comprador.
export const WALINKA_MARKETPLACE_FEE_BPS = 100;

const SUPPORTED_FEE_CURRENCIES = ['CLP', 'ARS'] as const;
export type SupportedFeeCurrency = (typeof SUPPORTED_FEE_CURRENCIES)[number];

export type ComputeWalinkaMarketplaceFeeResult =
  | { ok: true; feeCents: number; fee: number }
  | { ok: false; reason: 'UNSUPPORTED_CURRENCY' | 'INVALID_AMOUNT' };

/**
 * @param totalCents Total YA recalculado desde DB (wa_orders.total_amount
 *   o el total del carrito recién validado), en centavos enteros --
 *   nunca un valor recibido del frontend.
 * @param currency 'CLP' | 'ARS'. Cualquier otro valor se rechaza
 *   (UNSUPPORTED_CURRENCY) -- sin fallback silencioso a una moneda por
 *   defecto.
 */
export function computeWalinkaMarketplaceFee(totalCents: number, currency: string): ComputeWalinkaMarketplaceFeeResult {
  if (!Number.isFinite(totalCents) || !Number.isInteger(totalCents) || totalCents < 0) {
    return { ok: false, reason: 'INVALID_AMOUNT' };
  }

  if (!(SUPPORTED_FEE_CURRENCIES as readonly string[]).includes(currency)) {
    return { ok: false, reason: 'UNSUPPORTED_CURRENCY' };
  }

  if (currency === 'CLP') {
    // Redondeo en PESOS enteros (no en centavos) -- CLP no tiene
    // sub-unidad práctica en Mercado Pago.
    const totalPesos = totalCents / 100;
    const feePesos = Math.round(totalPesos * (WALINKA_MARKETPLACE_FEE_BPS / 10000));
    return { ok: true, feeCents: feePesos * 100, fee: feePesos };
  }

  // ARS (única moneda restante tras el chequeo de arriba): redondeo en
  // CENTAVOS enteros.
  const feeCents = Math.round(totalCents * (WALINKA_MARKETPLACE_FEE_BPS / 10000));
  return { ok: true, feeCents, fee: feeCents / 100 };
}
