/**
 * create-merchant-mp-checkout/lib.ts
 * Funciones puras extraídas de index.ts para poder testearlas en
 * Vitest/Node (mismo criterio que mp-oauth-start/lib.ts,
 * mp-oauth-callback/lib.ts, mp-webhook/lib.ts). Nada acá toca
 * Deno.env ni hace fetch/DB -- solo validación, cálculo de precios y
 * construcción de payloads a partir de datos YA resueltos por el
 * caller (index.ts).
 *
 * Aritmética monetaria: todo se calcula en CENTAVOS (enteros) y solo
 * se convierte de vuelta a un número con 2 decimales al final
 * (fromCents). Evita el drift de punto flotante de sumar/multiplicar
 * repetidamente números decimales binarios inexactos (0.1+0.2 style)
 * al totalizar muchas líneas de carrito -- wa_products.price y
 * wa_orders.total_amount/subtotal son NUMERIC(10,2) en Postgres, así
 * que el resultado final siempre debe tener como máximo 2 decimales
 * exactos.
 */

import {
  normalizeMpOauthCountry,
  type SupportedMpOauthCountry,
} from '../_shared/mpOauthCredentials.ts';

// ── Límites de abuso (sin infra de rate limiting en el repo -- ver auditoría
//    MP-CHECKOUT-1 sección 19: estos son los únicos límites disponibles hoy) ──
export const MAX_CART_ITEMS = 50;
export const MAX_ITEM_QUANTITY = 100;
export const MAX_NAME_LENGTH = 200;
export const MAX_EMAIL_LENGTH = 254;
export const MAX_PHONE_LENGTH = 32;
export const MAX_NOTES_LENGTH = 500;
export const MAX_ADDRESS_LENGTH = 300;
export const MAX_BODY_BYTES = 32 * 1024; // 32KB -- generoso para un carrito de 50 items sin imágenes

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SERVICE_TYPES = ['mesa', 'pickup', 'delivery'] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

// ── Moneda por país -- mismo conjunto soportado (CL/AR) y mismo
//    normalizador estricto (sin fuzzy matching, sin fallback a
//    wa_businesses.country) que ya usa MP-OAUTH para credenciales:
//    el checkout de comercio solo tiene sentido donde el comercio
//    puede tener una conexión MP, es decir, los mismos 2 países. ────────────
const CURRENCY_BY_COUNTRY: Record<SupportedMpOauthCountry, string> = {
  CL: 'CLP',
  AR: 'ARS',
};

export type ResolveCheckoutCurrencyResult =
  | { ok: true; countryCode: SupportedMpOauthCountry; currency: string }
  | { ok: false };

export function resolveCheckoutCurrency(rawCountryCode: string | null | undefined): ResolveCheckoutCurrencyResult {
  const countryCode = normalizeMpOauthCountry(rawCountryCode);
  if (countryCode === null) return { ok: false };
  return { ok: true, countryCode, currency: CURRENCY_BY_COUNTRY[countryCode] };
}

// ── Dinero en centavos (enteros) -- ver comentario de cabecera. ────────────
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

// ── Carrito recibido del frontend -- únicamente productId/quantity son
//    autoridad de INTENCIÓN, nunca de precio/nombre/moneda. ────────────────
export interface RawCartItem {
  productId?: unknown;
  quantity?: unknown;
}

export interface ParsedCartItem {
  productId: string;
  quantity: number;
}

export type ParseCartItemsResult =
  | { ok: true; items: ParsedCartItem[] }
  | { ok: false; reason: 'EMPTY_CART' | 'INVALID_REQUEST' };

export function parseCartItems(raw: unknown): ParseCartItemsResult {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, reason: 'EMPTY_CART' };
  if (raw.length > MAX_CART_ITEMS) return { ok: false, reason: 'INVALID_REQUEST' };

  const items: ParsedCartItem[] = [];
  for (const rawItem of raw as RawCartItem[]) {
    const productId = rawItem?.productId;
    const quantity = rawItem?.quantity;
    if (typeof productId !== 'string' || !UUID_RE.test(productId)) {
      return { ok: false, reason: 'INVALID_REQUEST' };
    }
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_ITEM_QUANTITY) {
      return { ok: false, reason: 'INVALID_REQUEST' };
    }
    items.push({ productId, quantity });
  }
  return { ok: true, items };
}

// ── Cliente -- solo lo mínimo, nunca autoridad de precio/país. ─────────────
export interface RawCustomer {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
}

export interface ParsedCustomer {
  name: string;
  email: string | null;
  phone: string | null;
}

export type ParseCustomerResult = { ok: true; customer: ParsedCustomer } | { ok: false; reason: 'INVALID_REQUEST' };

export function parseCustomer(raw: unknown): ParseCustomerResult {
  const rawCustomer = (raw ?? {}) as RawCustomer;
  const name = typeof rawCustomer.name === 'string' ? rawCustomer.name.trim() : '';
  if (!name || name.length > MAX_NAME_LENGTH) return { ok: false, reason: 'INVALID_REQUEST' };

  let email: string | null = null;
  if (rawCustomer.email !== undefined && rawCustomer.email !== null && rawCustomer.email !== '') {
    if (typeof rawCustomer.email !== 'string') return { ok: false, reason: 'INVALID_REQUEST' };
    const trimmedEmail = rawCustomer.email.trim();
    if (trimmedEmail.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(trimmedEmail)) {
      return { ok: false, reason: 'INVALID_REQUEST' };
    }
    email = trimmedEmail.toLowerCase();
  }

  let phone: string | null = null;
  if (rawCustomer.phone !== undefined && rawCustomer.phone !== null && rawCustomer.phone !== '') {
    if (typeof rawCustomer.phone !== 'string') return { ok: false, reason: 'INVALID_REQUEST' };
    const trimmedPhone = rawCustomer.phone.trim();
    if (trimmedPhone.length > MAX_PHONE_LENGTH) return { ok: false, reason: 'INVALID_REQUEST' };
    phone = trimmedPhone;
  }

  return { ok: true, customer: { name, email, phone } };
}

/** `null` = campo ausente (válido). `'invalid'` = presente pero con un valor fuera del enum real de wa_orders.service_type. */
export function parseServiceType(raw: unknown): ServiceType | null | 'invalid' {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string') return 'invalid';
  return (SERVICE_TYPES as readonly string[]).includes(raw) ? (raw as ServiceType) : 'invalid';
}

/** Texto libre opcional (delivery_address, notes) -- trim, null si vacío, 'invalid' si excede el largo máximo. */
export function sanitizeOptionalText(raw: unknown, maxLength: number): string | null | 'invalid' {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string') return 'invalid';
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (trimmed.length > maxLength) return 'invalid';
  return trimmed;
}

// ── Validación + recálculo de precio por línea -- CRÍTICO: unit_price
//    viene SIEMPRE de `product.price` (ya leído de wa_products por el
//    caller), nunca del carrito recibido del frontend. ─────────────────────
export interface ProductRow {
  id: string;
  businessId: string;
  name: string;
  price: number;
  isActive: boolean;
  isSoldOut: boolean;
  stockActual: number | null;
}

export interface PricedCartLine {
  productId: string;
  productName: string;
  unitPriceCents: number;
  quantity: number;
  subtotalCents: number;
}

export type ValidateLineResult =
  | { ok: true; line: PricedCartLine }
  | { ok: false; reason: 'PRODUCT_NOT_FOUND' | 'PRODUCT_NOT_AVAILABLE' | 'INSUFFICIENT_STOCK' };

export function validateAndPriceLine(
  item: ParsedCartItem,
  product: ProductRow | undefined,
  businessId: string,
): ValidateLineResult {
  if (!product || product.businessId !== businessId) {
    return { ok: false, reason: 'PRODUCT_NOT_FOUND' };
  }
  if (!product.isActive || product.isSoldOut) {
    return { ok: false, reason: 'PRODUCT_NOT_AVAILABLE' };
  }
  if (product.stockActual !== null && item.quantity > product.stockActual) {
    return { ok: false, reason: 'INSUFFICIENT_STOCK' };
  }

  const unitPriceCents = toCents(product.price);
  return {
    ok: true,
    line: {
      productId: product.id,
      productName: product.name,
      unitPriceCents,
      quantity: item.quantity,
      subtotalCents: unitPriceCents * item.quantity,
    },
  };
}

/**
 * Valida TODAS las líneas antes de aceptar ninguna -- un solo producto
 * inválido rechaza el carrito completo (nunca un pedido parcial, nunca
 * se ignoran líneas silenciosamente).
 */
export function validateCart(
  items: ParsedCartItem[],
  productsById: Map<string, ProductRow>,
  businessId: string,
): { ok: true; lines: PricedCartLine[] } | { ok: false; reason: ValidateLineResult extends { ok: false; reason: infer R } ? R : never } {
  const lines: PricedCartLine[] = [];
  for (const item of items) {
    const result = validateAndPriceLine(item, productsById.get(item.productId), businessId);
    if (!result.ok) return result;
    lines.push(result.line);
  }
  return { ok: true, lines };
}

export function computeOrderTotals(lines: PricedCartLine[]): { subtotalCents: number; totalCents: number } {
  // MVP: sin descuentos ni despacho (no existen hoy en wa_orders -- ver
  // auditoría MP-CHECKOUT-0 sección 3.G). subtotal === total a propósito.
  const subtotalCents = lines.reduce((sum, line) => sum + line.subtotalCents, 0);
  return { subtotalCents, totalCents: subtotalCents };
}

// ── external_reference -- SIEMPRE construida server-side, nunca aceptada
//    del frontend. Prefijo `merchant` la distingue inequívocamente del
//    formato de billing (`waP:<paymentId>:<businessId>:<planSlug>`). ──────
export function buildExternalReference(businessId: string, orderId: string): string {
  return `walinka:merchant:${businessId}:${orderId}`;
}

// ── Token expirado -- token_expires_at ausente (null) significa que MP no
//    devolvió expiración conocida; no bloquear en ese caso (no hay forma de
//    saberlo, y MP-CHECKOUT-1 no implementa refresh de todos modos). ──────
export function isTokenExpired(tokenExpiresAtIso: string | null, now: Date = new Date()): boolean {
  if (!tokenExpiresAtIso) return false;
  const expiresAt = new Date(tokenExpiresAtIso).getTime();
  if (!Number.isFinite(expiresAt)) return false;
  return expiresAt <= now.getTime();
}

// ── back_urls -- construidas SIEMPRE desde el origen público canónico +
//    el slug ya resuelto server-side, nunca desde una URL completa
//    enviada por el frontend (evita open redirect). ────────────────────────
export interface BackUrls {
  success: string;
  pending: string;
  failure: string;
}

export function buildBackUrls(appBaseUrl: string, slug: string): BackUrls {
  const base = appBaseUrl.replace(/\/$/, '');
  return {
    success: `${base}/catalogo/${slug}/pago/exito`,
    pending: `${base}/catalogo/${slug}/pago/pendiente`,
    failure: `${base}/catalogo/${slug}/pago/error`,
  };
}

// ── Payload de Checkout Pro -- solo los campos documentados por MP,
//    construido enteramente con datos server-side. payer minimiza datos
//    (nunca phone/address/notes -- ver auditoría MP-CHECKOUT-0 sección 18). ─
export interface BuildPreferencePayloadInput {
  lines: PricedCartLine[];
  currency: string;
  externalReference: string;
  backUrls: BackUrls;
  notificationUrl?: string;
  payerName: string;
  payerEmail: string | null;
  marketplaceFee: number;
}

export function buildPreferencePayload({
  lines,
  currency,
  externalReference,
  backUrls,
  notificationUrl,
  payerName,
  payerEmail,
  marketplaceFee,
}: BuildPreferencePayloadInput): Record<string, unknown> {
  return {
    items: lines.map((line) => ({
      title: line.productName,
      quantity: line.quantity,
      unit_price: fromCents(line.unitPriceCents),
      currency_id: currency,
    })),
    back_urls: { success: backUrls.success, failure: backUrls.failure, pending: backUrls.pending },
    auto_return: 'approved' as const,
    external_reference: externalReference,
    payer: { name: payerName, ...(payerEmail ? { email: payerEmail } : {}) },
    // MP-MARKETPLACE-1 — comisión de PLATAFORMA (Walinka) descontada de
    // la liquidación del VENDEDOR vía Split Payments 1:1 de Mercado
    // Pago. NUNCA un recargo al comprador: el comprador sigue pagando
    // exactamente la suma de `items` de arriba, sin cambios.
    marketplace_fee: marketplaceFee,
    ...(notificationUrl && { notification_url: notificationUrl }),
  };
}

// ── Items JSONB para wa_create_merchant_checkout_order -- shape exacto
//    que espera la RPC (ver migración). ─────────────────────────────────────
export function buildOrderItemsPayload(lines: PricedCartLine[]): Array<Record<string, unknown>> {
  return lines.map((line) => ({
    product_id: line.productId,
    product_name: line.productName,
    unit_price: fromCents(line.unitPriceCents),
    quantity: line.quantity,
    subtotal: fromCents(line.subtotalCents),
  }));
}
