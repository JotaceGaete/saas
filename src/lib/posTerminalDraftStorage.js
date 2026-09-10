// TPV-CORE-2 — borrador local de la venta en curso de CrmTerminal.
//
// Mismo patrón que src/lib/productDraftStorage.js (schemaVersion + savedAt,
// localStorage protegido con try/catch, purga automática si el snapshot no
// pasa sanitización) pero SIN la parte de IndexedDB/blobs de imágenes --
// el TPV no tiene datos binarios que persistir.
//
// Este módulo es puramente de UI: nunca crea crm_invoices/crm_payments/
// crm_stock_movements. crm_create_pos_sale sigue siendo la única fuente de
// verdad -- lo que se guarda acá es solo lo necesario para reconstruir la
// pantalla, nunca se envía "tal cual" sin volver a pasar por esa RPC.

export const POS_TERMINAL_DRAFT_SCHEMA_VERSION = 1;

export function buildPosTerminalDraftKey(businessId) {
  const business = String(businessId || '').trim();
  if (!business) return null;
  return `pos-terminal-draft:${business}`;
}

function getLocalStorage() {
  return typeof window !== 'undefined' ? window.localStorage : null;
}

function sanitizeCartItem(item) {
  if (!item || typeof item !== 'object') return null;
  const _key = typeof item._key === 'string' && item._key ? item._key : null;
  const name = typeof item.name === 'string' ? item.name.trim() : '';
  const unitPrice = Number(item.unit_price);
  const quantity = Number(item.quantity);
  if (!_key || !name || !Number.isFinite(unitPrice) || unitPrice < 0
      || !Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }
  return {
    _key,
    product_id: typeof item.product_id === 'string' && item.product_id ? item.product_id : null,
    name,
    unit_price: unitPrice,
    quantity,
    note: typeof item.note === 'string' && item.note ? item.note : null,
  };
}

function sanitizePayment(payment) {
  if (!payment || typeof payment !== 'object') return null;
  const id = typeof payment.id === 'string' && payment.id ? payment.id : null;
  const method = typeof payment.method === 'string' && payment.method ? payment.method : null;
  if (!id || !method) return null;
  return {
    id,
    method,
    amount: typeof payment.amount === 'string' ? payment.amount : String(payment.amount ?? ''),
  };
}

/**
 * Valida y normaliza un snapshot crudo (ej. leído de localStorage, posible
 * JSON arbitrario). Nunca lanza -- devuelve null ante cualquier forma
 * inesperada, para que el caller lo trate como "sin borrador".
 */
export function sanitizePosTerminalDraft(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.schemaVersion !== POS_TERMINAL_DRAFT_SCHEMA_VERSION) return null;

  const cart = Array.isArray(raw.cart) ? raw.cart.map(sanitizeCartItem).filter(Boolean) : [];
  if (cart.length === 0) return null; // un borrador sin ítems no es útil de restaurar

  const idempotencyKey = typeof raw.idempotencyKey === 'string' && raw.idempotencyKey ? raw.idempotencyKey : null;
  if (!idempotencyKey) return null; // sin key no hay forma segura de reenviar sin duplicar

  const savedAt = typeof raw.savedAt === 'number' && Number.isFinite(raw.savedAt) ? raw.savedAt : null;
  if (!savedAt) return null;

  const payments = Array.isArray(raw.payments) ? raw.payments.map(sanitizePayment).filter(Boolean) : [];

  return {
    schemaVersion: POS_TERMINAL_DRAFT_SCHEMA_VERSION,
    cart,
    customerId: typeof raw.customerId === 'string' ? raw.customerId : '',
    discount: typeof raw.discount === 'string' ? raw.discount : '',
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    payments,
    idempotencyKey,
    savedAt,
  };
}

export function readPosTerminalDraft(key) {
  if (!key) return null;
  try {
    const raw = getLocalStorage()?.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const sanitized = sanitizePosTerminalDraft(parsed);
    if (!sanitized) {
      removePosTerminalDraft(key);
      return null;
    }
    return sanitized;
  } catch {
    removePosTerminalDraft(key);
    return null;
  }
}

/**
 * Nunca lanza: un fallo de storage (cuota excedida, modo privado, etc.) no
 * debe impedir vender -- solo se pierde la comodidad del borrador.
 */
export function writePosTerminalDraft(key, snapshot) {
  if (!key || !snapshot) return false;
  try {
    getLocalStorage()?.setItem(key, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

export function removePosTerminalDraft(key) {
  if (!key) return false;
  try {
    getLocalStorage()?.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function buildPosTerminalDraftSnapshot({ cart, customerId, discount, notes, payments, idempotencyKey }) {
  return {
    schemaVersion: POS_TERMINAL_DRAFT_SCHEMA_VERSION,
    cart: Array.isArray(cart) ? cart : [],
    customerId: customerId || '',
    discount: discount || '',
    notes: notes || '',
    payments: Array.isArray(payments) ? payments : [],
    idempotencyKey: idempotencyKey || null,
    savedAt: Date.now(),
  };
}

/** true si savedAt cae en el mismo día calendario LOCAL que `now`. */
export function isDraftFromToday(savedAt, now = Date.now()) {
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) return false;
  const a = new Date(savedAt);
  const b = new Date(now);
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}
