/**
 * merchant-mp-webhook/lib.ts
 * Funciones puras extraídas de index.ts para poder testearlas en
 * Vitest/Node (mismo criterio que mp-webhook/lib.ts,
 * create-merchant-mp-checkout/lib.ts). Nada acá toca Deno.env ni hace
 * fetch/DB.
 */

export const MAX_BODY_BYTES = 32 * 1024;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Vocabulario real de la Payments API de Mercado Pago. refunded/
 * charged_back se reconocen (para no descartarlos como "desconocido")
 * pero MP-CHECKOUT-2 no aplica ningún side-effect para ellos -- eso
 * es refund/chargeback completo, explícitamente fuera de alcance.
 */
export const KNOWN_MP_PAYMENT_STATUSES = [
  'pending', 'approved', 'authorized', 'in_process', 'in_mediation',
  'rejected', 'cancelled', 'refunded', 'charged_back',
] as const;
export type KnownMpPaymentStatus = (typeof KNOWN_MP_PAYMENT_STATUSES)[number];

export function isKnownMpPaymentStatus(status: string): status is KnownMpPaymentStatus {
  return (KNOWN_MP_PAYMENT_STATUSES as readonly string[]).includes(status);
}

// ── Notificación del webhook -- SOLO se extrae la identidad mínima del
//    evento (type + payment id). Nunca se lee/confía en status, amount,
//    currency, business_id, order_id ni external_reference del BODY del
//    webhook -- todo eso se re-deriva de consultar Mercado Pago
//    directamente (ver index.ts). Únicamente merchant_order NO está
//    soportado en esta fase (a diferencia de mp-webhook de billing) --
//    Checkout Pro con notification_url configurada envía notificaciones
//    type=payment directamente, que es el único camino necesario acá. ──
export interface WebhookNotification {
  dataId: string;
}

export function parseWebhookNotification(body: unknown): WebhookNotification | null {
  const record = (body ?? {}) as Record<string, unknown>;
  const type = record.type;
  const data = record.data as { id?: unknown } | undefined;
  const dataId = data?.id != null ? String(data.id).trim() : '';

  if (type !== 'payment' || !dataId) return null;
  return { dataId };
}

// ── order_id hint en notification_url -- SOLO sirve para elegir qué
//    conexión MP (de qué negocio) usar al consultar Mercado Pago. Nunca
//    es la fuente de verdad de a quién pertenece el pago -- eso se
//    re-confirma después contra external_reference de la respuesta
//    real de MP (ver validateReferenceMatch). ─────────────────────────
export function isValidOrderIdHint(raw: string | null): raw is string {
  return raw !== null && UUID_RE.test(raw);
}

// ── external_reference -- SIEMPRE la de la respuesta de Mercado Pago,
//    nunca la del body del webhook. Formato estricto
//    walinka:merchant:<business_id>:<order_id> -- rechaza el formato de
//    billing (waP:...) y cualquier cosa malformada. ─────────────────
const EXTERNAL_REF_RE = /^walinka:merchant:([0-9a-f-]{36}):([0-9a-f-]{36})$/i;

export interface ParsedExternalReference {
  businessId: string;
  orderId: string;
}

export function parseExternalReference(raw: string | null | undefined): ParsedExternalReference | null {
  if (!raw) return null;
  const match = EXTERNAL_REF_RE.exec(raw);
  if (!match) return null;
  const [, businessId, orderId] = match;
  if (!UUID_RE.test(businessId) || !UUID_RE.test(orderId)) return null;
  return { businessId, orderId };
}

export function validateReferenceMatch(
  parsed: ParsedExternalReference,
  expectedBusinessId: string,
  expectedOrderId: string,
): boolean {
  return parsed.businessId === expectedBusinessId && parsed.orderId === expectedOrderId;
}

// ── Comparación de montos sin drift de punto flotante (mismo criterio
//    que create-merchant-mp-checkout/lib.ts: centavos enteros). ────────
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function amountsMatch(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return toCents(a) === toCents(b);
}

// ── Excepciones de la RPC que deben tratarse como "evento inválido,
//    sin reintento útil" en vez de un 500 genérico -- estructuralmente
//    no deberían ocurrir nunca (el caller ya validó amount/currency/
//    business/order antes de invocar la RPC), pero si ocurren no tiene
//    sentido pedirle a Mercado Pago que reintente algo que no va a
//    cambiar. ─────────────────────────────────────────────────────────
const NON_RETRYABLE_RPC_ERRORS = ['AMOUNT_CURRENCY_MISMATCH', 'ORDER_BUSINESS_MISMATCH', 'MISSING_REQUIRED_PARAMETER'];

export function isNonRetryableRpcError(message: string | null | undefined): boolean {
  if (!message) return false;
  return NON_RETRYABLE_RPC_ERRORS.some((code) => message.includes(code));
}
