// Empresas autorizadas para emitir boletas electrónicas (alcance actual: las empresas propias de
// Walinka). Se valida en el servidor —fiscal-emit y api/fiscal— con dos datos internos: el id del
// negocio (UUID de wa_businesses) y el RUT del emisor. Nunca con nombres comerciales.
//
// Variable de entorno del servidor (Supabase secrets y Vercel, NUNCA VITE_*):
//   FISCAL_ALLOWED_ISSUERS="<uuid>=<rut>,<uuid>=<rut>,<uuid>=<rut>"
//   p. ej. "7c9e6679-7425-40de-944b-e07fc1f90ae7=76123456-0"
//
// Falla cerrado:
//   - Sin variable o vacía: ningún negocio está autorizado.
//   - Formato inválido (UUID, RUT o dígito verificador, duplicados): ningún negocio está
//     autorizado y `error` explica el motivo (sin repetir el contenido de la variable).
//   - Un negocio solo está autorizado con SU RUT: el mismo RUT en otro negocio, u otro RUT en el
//     mismo negocio, no lo está.

export const ALLOWED_ISSUERS_ENV = 'FISCAL_ALLOWED_ISSUERS';
export const MAX_ALLOWED_ISSUERS = 10;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// RUT chileno: cuerpo + dígito verificador (módulo 11). Devuelve la forma canónica "12345678-K"
// (sin puntos, sin ceros a la izquierda) o null. Misma regla que api/_lib/fiscal-connection.js.
export function normalizeRut(input) {
  if (typeof input !== 'string') return null;
  const clean = input.replace(/[.\s]/g, '').toUpperCase();
  const m = /^(\d{1,8})-([0-9K])$/.exec(clean);
  if (!m) return null;
  const body = m[1];
  const dv = m[2];
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i -= 1) {
    sum += Number(body[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const r = 11 - (sum % 11);
  const expected = r === 11 ? '0' : r === 10 ? 'K' : String(r);
  if (dv !== expected) return null;
  return `${Number(body)}-${dv}`;
}

function frozenAllowlist(map, error = null) {
  return Object.freeze({
    error,
    size: map.size,
    /** ¿El negocio está autorizado? (sin mirar el RUT; para acciones previas a tener emisor). */
    permitsBusiness(businessId) {
      return typeof businessId === 'string' && map.has(businessId.toLowerCase());
    },
    /** ¿El negocio está autorizado con este RUT de emisor? */
    permits(businessId, issuerRut) {
      if (typeof businessId !== 'string') return false;
      const expected = map.get(businessId.toLowerCase());
      const rut = normalizeRut(typeof issuerRut === 'string' ? issuerRut : '');
      return Boolean(expected && rut && rut === expected);
    },
  });
}

/** Lista vacía: nadie autorizado. */
export const EMPTY_ALLOWLIST = frozenAllowlist(new Map());

/**
 * Lee la lista desde el texto de la variable. Nunca lanza: ante cualquier error devuelve una lista
 * vacía con `error` (el servidor arranca, pero no autoriza a nadie).
 */
export function parseAllowedIssuers(raw) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return frozenAllowlist(new Map(), 'ALLOWLIST_EMPTY');
  const entries = text.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  if (entries.length > MAX_ALLOWED_ISSUERS) return frozenAllowlist(new Map(), 'ALLOWLIST_TOO_LONG');
  const map = new Map();
  const ruts = new Set();
  for (const entry of entries) {
    const m = /^([^=\s]+)\s*=\s*(\S+)$/.exec(entry);
    if (!m) return frozenAllowlist(new Map(), 'ALLOWLIST_FORMAT');
    const businessId = m[1].toLowerCase();
    if (!UUID.test(businessId)) return frozenAllowlist(new Map(), 'ALLOWLIST_BUSINESS_ID');
    const rut = normalizeRut(m[2]);
    if (!rut) return frozenAllowlist(new Map(), 'ALLOWLIST_RUT');
    if (map.has(businessId) || ruts.has(rut)) return frozenAllowlist(new Map(), 'ALLOWLIST_DUPLICATE');
    map.set(businessId, rut);
    ruts.add(rut);
  }
  return frozenAllowlist(map);
}

/** Lista desde el entorno del proceso (objeto tipo process.env / Deno.env.toObject()). */
export function allowlistFromEnv(env = {}) {
  return parseAllowedIssuers(env[ALLOWED_ISSUERS_ENV]);
}

/** ¿El objeto cumple la interfaz que exige el emisor? (para fallar cerrado al construirlo). */
export function isAllowlist(value) {
  return Boolean(value) && typeof value.permits === 'function' && typeof value.permitsBusiness === 'function';
}
