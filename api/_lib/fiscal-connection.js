// Conexión de facturación electrónica por comercio (DTECore). Lógica sin dependencia del runtime.
//
// Reglas:
//  - Solo el propietario fiscal (fiscal_owner) conecta, reemplaza o desconecta. La guarda llega ya
//    decidida (assertAccess); aquí no se confía en el cliente.
//  - La API key entra una vez, se sella (AES-256-GCM, AAD por negocio) y nunca vuelve al navegador:
//    ninguna respuesta, error ni log contiene la clave.
//  - Guardar o desconectar NO habilita emisión (lo hace la base: enabled = false, verified = false).
//  - Entrada estricta: solo los campos de cada acción. Cualquier otro campo se rechaza.

import { seal } from '../../supabase/functions/fiscal-emit/lib/secrets.mjs';

const KEY_VERSION = 1;
const CONNECT_FIELDS = new Set(['action', 'apiKey', 'issuerRut']);
const DISCONNECT_FIELDS = new Set(['action']);

// RUT chileno: cuerpo + dígito verificador (módulo 11). Devuelve forma canónica "12345678-K" o null.
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

// Clave: texto sin espacios ni caracteres de control, longitud razonable. Devuelve la clave o null.
export function validateApiKey(input) {
  if (typeof input !== 'string') return null;
  const key = input.trim();
  if (key.length < 16 || key.length > 200) return null;
  if (!/^[\x21-\x7E]+$/.test(key)) return null;
  return key;
}

function fail(status, error) {
  return { status, body: { error } };
}

// Traduce errores de la base (mensaje FISCAL_* o código) a respuestas públicas estables.
function mapDbError(err) {
  const msg = String(err?.message ?? '');
  if (msg.includes('FISCAL_OPERATION_IN_PROGRESS')) return fail(409, 'FISCAL_OPERATION_IN_PROGRESS');
  if (msg.includes('FISCAL_BUSINESS_INACTIVE')) return fail(403, 'BUSINESS_NOT_AUTHORIZED');
  return fail(503, 'SERVER_ERROR');
}

function toBytea(buf) {
  return `\\x${Buffer.from(buf).toString('hex')}`;
}

// Estado público de la conexión. Nunca contiene la clave.
function publicConnection(row) {
  if (!row) return { connected: false, issuerRut: null, enabled: false, verified: false, keyVersion: null, updatedAt: null };
  return {
    connected: row.connected === true,
    issuerRut: row.issuerRut ?? null,
    enabled: row.enabled === true,
    verified: row.verified === true,
    keyVersion: row.keyVersion ?? null,
    updatedAt: row.updatedAt ?? null,
  };
}

export function createFiscalConnectionService({ admin, masterKey }) {
  if (!admin || typeof admin.rpc !== 'function') throw new Error('admin client with rpc required');
  if (!masterKey) throw new Error('master key required');

  async function readStatus(businessId) {
    const { data, error } = await admin.rpc('crm_fiscal_connection_status', { p_business_id: businessId });
    if (error) return { ok: false, ...mapDbError(error) };
    return { ok: true, connection: publicConnection(data) };
  }

  async function status({ businessId }) {
    const r = await readStatus(businessId);
    if (!r.ok) return { status: r.status, body: r.body };
    return { status: 200, body: { connection: r.connection } };
  }

  async function connect({ businessId, actorId, body }) {
    for (const key of Object.keys(body)) {
      if (!CONNECT_FIELDS.has(key)) return fail(400, 'UNKNOWN_FIELD');
    }
    const issuerRut = normalizeRut(body.issuerRut);
    if (!issuerRut) return fail(400, 'INVALID_RUT');
    const apiKey = validateApiKey(body.apiKey);
    if (!apiKey) return fail(400, 'INVALID_API_KEY');

    // Sellado: la clave no sale de este bloque. Solo viajan bytes cifrados a la base.
    const sealed = seal({ apiKey }, { key: masterKey, businessId, provider: 'dtecore', keyVersion: KEY_VERSION });
    const { error } = await admin.rpc('crm_fiscal_save_credentials', {
      p_business_id: businessId,
      p_actor_user_id: actorId,
      p_issuer_rut: issuerRut,
      p_ciphertext: toBytea(sealed.ciphertext),
      p_iv: toBytea(sealed.iv),
      p_auth_tag: toBytea(sealed.authTag),
      p_key_version: KEY_VERSION,
    });
    if (error) return mapDbError(error);

    const r = await readStatus(businessId);
    if (!r.ok) return { status: r.status, body: r.body };
    return { status: 200, body: { connection: r.connection } };
  }

  async function disconnect({ businessId, actorId, body }) {
    for (const key of Object.keys(body)) {
      if (!DISCONNECT_FIELDS.has(key)) return fail(400, 'UNKNOWN_FIELD');
    }
    const { error } = await admin.rpc('crm_fiscal_disconnect', { p_business_id: businessId, p_actor_user_id: actorId });
    if (error) return mapDbError(error);
    const r = await readStatus(businessId);
    if (!r.ok) return { status: r.status, body: r.body };
    return { status: 200, body: { connection: r.connection } };
  }

  return Object.freeze({ status, connect, disconnect });
}
