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
import { CANONICAL_PROVIDER } from '../../supabase/functions/fiscal-emit/lib/provider-ids.mjs';

const KEY_VERSION = 1;
const CONNECT_FIELDS = new Set(['action', 'apiKey', 'issuerRut']);
const DISCONNECT_FIELDS = new Set(['action']);
const SUBMIT_FIELDS = new Set(['action', 'apiKey', 'issuerRut', 'resolucionNumero', 'resolucionFecha', 'sucursalNombre', 'sucursalCodigo']);

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

// Resolución SII: número entero 1..999999 y fecha YYYY-MM-DD real, desde 2003 y no futura.
export function validateResolucion(numero, fecha, { today = new Date() } = {}) {
  const n = typeof numero === 'number' ? numero : Number(String(numero ?? '').trim());
  if (!Number.isInteger(n) || n < 1 || n > 999999) return null;
  const f = String(fecha ?? '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== f) return null;
  if (f < '2003-01-01' || f > today.toISOString().slice(0, 10)) return null;
  return { numero: n, fecha: f };
}

// Sucursal opcional: nombre hasta 80 caracteres imprimibles; código numérico del SII (1-9 dígitos).
export function validateSucursal(nombre, codigo) {
  const n = String(nombre ?? '').trim();
  const c = String(codigo ?? '').trim();
  if (n && (n.length > 80 || /[\u0000-\u001f]/.test(n))) return null;
  if (c && !/^[0-9]{1,9}$/.test(c)) return null;
  return { nombre: n || null, codigo: c || null };
}

function fail(status, error) {
  return { status, body: { error } };
}

// Traduce errores de la base (mensaje FISCAL_* o código) a respuestas públicas estables.
function mapDbError(err) {
  const msg = String(err?.message ?? '');
  if (msg.includes('FISCAL_OPERATION_IN_PROGRESS')) return fail(409, 'FISCAL_OPERATION_IN_PROGRESS');
  if (msg.includes('FISCAL_BUSINESS_INACTIVE')) return fail(403, 'BUSINESS_NOT_AUTHORIZED');
  if (msg.includes('FISCAL_CREDENTIALS_REQUIRED')) return fail(409, 'API_KEY_REQUIRED');
  if (msg.includes('FISCAL_APPLICATION_INVALID')) return fail(400, 'INVALID_APPLICATION');
  return fail(503, 'SERVER_ERROR');
}

function toBytea(buf) {
  return `\\x${Buffer.from(buf).toString('hex')}`;
}

// Estado público de la conexión. Nunca contiene la clave.
const REVIEW_STATUSES = new Set(['draft', 'pending_review', 'approved', 'rejected', 'suspended']);

function publicConnection(row) {
  if (!row) {
    return {
      connected: false, issuerRut: null, enabled: false, verified: false, keyVersion: null, updatedAt: null,
      reviewStatus: 'draft', reviewNote: null, submittedAt: null, reviewedAt: null,
      resolucionNumero: null, resolucionFecha: null, sucursalNombre: null, sucursalCodigo: null,
    };
  }
  return {
    connected: row.connected === true,
    issuerRut: row.issuerRut ?? null,
    enabled: row.enabled === true,
    verified: row.verified === true,
    keyVersion: row.keyVersion ?? null,
    updatedAt: row.updatedAt ?? null,
    reviewStatus: REVIEW_STATUSES.has(row.reviewStatus) ? row.reviewStatus : 'draft',
    reviewNote: row.reviewNote ?? null,
    submittedAt: row.submittedAt ?? null,
    reviewedAt: row.reviewedAt ?? null,
    resolucionNumero: row.resolucionNumero ?? null,
    resolucionFecha: row.resolucionFecha ?? null,
    sucursalNombre: row.sucursalNombre ?? null,
    sucursalCodigo: row.sucursalCodigo ?? null,
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

  // Guarda RUT + API key sellada. La clave no sale de este bloque: solo viajan bytes cifrados.
  async function saveCredentials(businessId, actorId, issuerRut, apiKey) {
    const sealed = seal({ apiKey }, { key: masterKey, businessId, provider: CANONICAL_PROVIDER, keyVersion: KEY_VERSION });
    const { error } = await admin.rpc('crm_fiscal_save_credentials', {
      p_business_id: businessId,
      p_actor_user_id: actorId,
      p_issuer_rut: issuerRut,
      p_ciphertext: toBytea(sealed.ciphertext),
      p_iv: toBytea(sealed.iv),
      p_auth_tag: toBytea(sealed.authTag),
      p_key_version: KEY_VERSION,
    });
    return error ? mapDbError(error) : null;
  }

  async function connect({ businessId, actorId, body }) {
    for (const key of Object.keys(body)) {
      if (!CONNECT_FIELDS.has(key)) return fail(400, 'UNKNOWN_FIELD');
    }
    const issuerRut = normalizeRut(body.issuerRut);
    if (!issuerRut) return fail(400, 'INVALID_RUT');
    const apiKey = validateApiKey(body.apiKey);
    if (!apiKey) return fail(400, 'INVALID_API_KEY');
    const failed = await saveCredentials(businessId, actorId, issuerRut, apiKey);
    if (failed) return failed;

    const r = await readStatus(businessId);
    if (!r.ok) return { status: r.status, body: r.body };
    return { status: 200, body: { connection: r.connection } };
  }

  // Formulario único del comercio: RUT + API key + resolución SII (+ sucursal) y envío a revisión
  // de Walinka. La API key es opcional si ya hay una guardada para el mismo RUT (p. ej. para
  // corregir la resolución tras un rechazo). Enviar nunca habilita la emisión: lo hace Walinka.
  async function submit({ businessId, actorId, body }) {
    for (const key of Object.keys(body)) {
      if (!SUBMIT_FIELDS.has(key)) return fail(400, 'UNKNOWN_FIELD');
    }
    const issuerRut = normalizeRut(body.issuerRut);
    if (!issuerRut) return fail(400, 'INVALID_RUT');
    const resolucion = validateResolucion(body.resolucionNumero, body.resolucionFecha);
    if (!resolucion) return fail(400, 'INVALID_RESOLUCION');
    const sucursal = validateSucursal(body.sucursalNombre, body.sucursalCodigo);
    if (!sucursal) return fail(400, 'INVALID_SUCURSAL');

    const hasKey = typeof body.apiKey === 'string' && body.apiKey.trim() !== '';
    if (hasKey) {
      const apiKey = validateApiKey(body.apiKey);
      if (!apiKey) return fail(400, 'INVALID_API_KEY');
      const failed = await saveCredentials(businessId, actorId, issuerRut, apiKey);
      if (failed) return failed;
    } else {
      const current = await readStatus(businessId);
      if (!current.ok) return { status: current.status, body: current.body };
      // Sin clave nueva solo se puede reenviar la misma cuenta: cambiar el RUT exige su API key.
      if (!current.connection.connected || current.connection.issuerRut !== issuerRut) return fail(409, 'API_KEY_REQUIRED');
    }

    const { error } = await admin.rpc('crm_fiscal_submit_application', {
      p_business_id: businessId,
      p_actor_user_id: actorId,
      p_resolucion_numero: resolucion.numero,
      p_resolucion_fecha: resolucion.fecha,
      p_sucursal_nombre: sucursal.nombre,
      p_sucursal_codigo: sucursal.codigo,
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

  return Object.freeze({ status, connect, submit, disconnect });
}
