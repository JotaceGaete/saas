/**
 * merchantCheckoutService — MP-CHECKOUT-3.
 * Cliente del catálogo público para el checkout Mercado Pago DEL
 * COMERCIO (create-merchant-mp-checkout, MP-CHECKOUT-1) y su estado de
 * disponibilidad sanitizado (wa_get_public_merchant_mp_availability,
 * MP-CHECKOUT-3). Completamente aislado del Mercado Pago de billing de
 * plataforma -- no lo importa. El comprador del catálogo es SIEMPRE
 * anónimo (sin sesión Walinka): este servicio nunca maneja un JWT de
 * usuario, solo la publishable key (mismo patrón que
 * recordCatalogVisit/recordCatalogWhatsAppClick).
 *
 * Este servicio NUNCA ve un access_token/refresh_token/client_secret --
 * el backend nunca los devuelve. Tampoco envía como autoridad price/
 * subtotal/total/currency/business_id/external_reference recibidos del
 * carrito: la Edge Function los ignora explícitamente y recalcula todo
 * server-side.
 */
import { supabase } from '../lib/supabase';
import { getSupabasePublishableKey } from '../lib/supabasePublishableKey';

const SUPABASE_URL = (import.meta.env?.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
const ANON_KEY = getSupabasePublishableKey();
const CHECKOUT_URL = `${SUPABASE_URL}/functions/v1/create-merchant-mp-checkout`;

const ERROR_MESSAGES = {
  MP_NOT_CONNECTED: 'Este comercio aún no tiene Mercado Pago conectado.',
  MP_CONNECTION_EXPIRED: 'La conexión de Mercado Pago de este comercio expiró. Intenta enviar tu pedido por WhatsApp.',
  MP_COUNTRY_NOT_SUPPORTED: 'Mercado Pago no está disponible para este comercio.',
  PRODUCT_NOT_FOUND: 'Uno de los productos de tu carrito ya no está disponible.',
  PRODUCT_NOT_AVAILABLE: 'Uno de los productos de tu carrito ya no está disponible.',
  INSUFFICIENT_STOCK: 'No hay stock suficiente para uno de los productos de tu carrito.',
  INVALID_QUANTITY: 'Revisa las cantidades de tu carrito.',
  INVALID_REQUEST: 'Revisa los datos de tu pedido e intenta nuevamente.',
  EMPTY_CART: 'Tu carrito está vacío.',
  BUSINESS_NOT_FOUND: 'No pudimos encontrar esta tienda.',
  BUSINESS_INACTIVE: 'Esta tienda no está disponible en este momento.',
};
// Fallback única y genérica -- cubre MP_PREFERENCE_FAILED/ORDER_CREATION_FAILED
// del backend, y cualquier error interno/sin `reason` (nunca se muestra un
// mensaje crudo de Supabase/Mercado Pago al comprador).
const DEFAULT_ERROR_MESSAGE = 'No pudimos iniciar el pago con Mercado Pago. Intenta nuevamente o usa WhatsApp.';

/**
 * Mensaje amigable para un `reason` devuelto por create-merchant-mp-checkout
 * (o ausente, en un fallo de red/interno). Nunca expone el texto crudo del
 * error.
 * @param {string|undefined} reason
 * @returns {string}
 */
export function getMerchantMpCheckoutErrorMessage(reason) {
  return ERROR_MESSAGES[reason] || DEFAULT_ERROR_MESSAGE;
}

/**
 * Estado público/sanitizado: ¿este negocio puede recibir pagos por
 * Mercado Pago hoy? Vía wa_get_public_merchant_mp_availability() --
 * única RPC de este flujo alcanzable por `anon` a propósito (el
 * comprador del catálogo no tiene sesión). Nunca lanza -- cualquier
 * error de red/RPC se trata como "no disponible" (la UI simplemente no
 * muestra el botón, WhatsApp sigue funcionando igual).
 * @param {string} businessSlug
 * @returns {Promise<boolean>}
 */
export async function getMerchantMpAvailability(businessSlug) {
  const slug = businessSlug?.trim();
  if (!slug) return false;
  try {
    const { data, error } = await supabase.rpc('wa_get_public_merchant_mp_availability', { p_business_slug: slug });
    if (error) return false;
    const row = Array.isArray(data) ? data?.[0] : data;
    return !!row?.available;
  } catch {
    return false;
  }
}

/**
 * Crea el checkout Mercado Pago del comercio. Envía únicamente
 * intención mínima -- businessSlug + items [{productId, quantity}] +
 * customer {name, phone?} + serviceType/deliveryAddress/notes
 * opcionales. NUNCA envía price/subtotal/total/currency/business_id/
 * external_reference como si fueran confiables (el backend los
 * ignora de todos modos, pero tampoco se construyen acá).
 * @param {{businessSlug: string, items: Array<{productId: string, quantity: number}>, customer: {name: string, phone?: string|null}, serviceType?: string|null, deliveryAddress?: string|null, notes?: string|null}} input
 * @returns {Promise<{data: {initPoint: string, orderId: string, preferenceId: string|null}|null, error: (Error & {reason?: string})|null}>}
 */
export async function createMerchantMpCheckout({ businessSlug, items, customer, serviceType, deliveryAddress, notes }) {
  try {
    const res = await fetch(CHECKOUT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
      body: JSON.stringify({
        businessSlug,
        items,
        customer,
        ...(serviceType ? { serviceType } : {}),
        ...(deliveryAddress ? { deliveryAddress } : {}),
        ...(notes ? { notes } : {}),
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.init_point) {
      const err = new Error(body?.error || `HTTP ${res.status}`);
      if (body?.reason) err.reason = body.reason;
      return { data: null, error: err };
    }
    return {
      data: { initPoint: body.init_point, orderId: body.order_id ?? null, preferenceId: body.preference_id ?? null },
      error: null,
    };
  } catch (err) {
    return { data: null, error: err };
  }
}
