// Conexión de facturación electrónica por comercio (DTECore). Lógica sin dependencia del runtime.
//
// Reglas:
//  - Solo el propietario fiscal (fiscal_owner) conecta, reemplaza o desconecta. La guarda llega ya
//    decidida (assertAccess); aquí no se confía en el cliente.
//  - La API key entra una vez, se sella (AES-256-GCM, AAD por negocio) y nunca vuelve al navegador:
//    ninguna respuesta, error ni log contiene la clave.
//  - Guardar o desconectar NO habilita emisión (lo hace la base: enabled = false, verified = false).
//  - Entrada estricta: solo los campos de cada acción. Cualquier otro campo se rechaza.
//  - Alcance actual: solo las empresas de la lista del servidor (FISCAL_ALLOWED_ISSUERS, id del
//    negocio + RUT). Otro negocio, o el mismo con otro RUT, no puede guardar credenciales ni enviar
//    la solicitud. Desconectar sí se permite siempre (solo borra).

import { seal, open } from '../../supabase/functions/fiscal-emit/lib/secrets.mjs';
import { resolveKeyOwnerRut } from '../../supabase/functions/fiscal-emit/lib/identity.mjs';
import { mapCredentialRecord } from '../../supabase/functions/fiscal-emit/lib/store-common.mjs';
import { createSiisolutionsHttpProvider } from '../../supabase/functions/fiscal-emit/lib/providers/siisolutions-http.mjs';
import { CANONICAL_PROVIDER } from '../../supabase/functions/fiscal-emit/lib/provider-ids.mjs';
import { isAllowlist, normalizeRut } from '../../supabase/functions/fiscal-emit/lib/allowlist.mjs';

const KEY_VERSION = 1;
const CONNECT_FIELDS = new Set(['action', 'apiKey', 'issuerRut']);
const DISCONNECT_FIELDS = new Set(['action']);
const VERIFY_FIELDS = new Set(['action']);
const TAX_DEFAULT_FIELDS = new Set(['action', 'category']);
const TAX_CATEGORIES = new Set(['IVA_AFECTO_19', 'EXENTO', 'NO_AFECTO']);
const SUBMIT_FIELDS = new Set(['action', 'apiKey', 'issuerRut', 'resolucionNumero', 'resolucionFecha', 'sucursalNombre', 'sucursalCodigo']);

// RUT chileno (módulo 11), forma canónica "12345678-K". Una sola implementación, compartida con la
// lista de empresas autorizadas del emisor (así no pueden divergir).
export { normalizeRut };

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
  if (msg.includes('FISCAL_TAX_INVALID')) return fail(400, 'INVALID_TAX_CATEGORY');
  // Migración H. RUT_NOT_AVAILABLE no dice a quién pertenece el RUT (no revela otros comercios).
  if (msg.includes('FISCAL_ISSUER_RUT_TAKEN')) return fail(409, 'RUT_NOT_AVAILABLE');
  if (msg.includes('FISCAL_ISSUER_RUT_INVALID')) return fail(400, 'INVALID_RUT');
  if (msg.includes('FISCAL_RUT_CHANGE_BLOCKED')) return fail(409, 'RUT_CHANGE_BLOCKED');
  if (msg.includes('FISCAL_IDENTITY_NOT_VERIFIED')) return fail(409, 'IDENTITY_NOT_VERIFIED');
  if (msg.includes('FISCAL_CREDENTIALS_MISSING')) return fail(409, 'API_KEY_REQUIRED');
  return fail(503, 'SERVER_ERROR');
}

function toBytea(buf) {
  return `\\x${Buffer.from(buf).toString('hex')}`;
}

// Estado público de la conexión. Nunca contiene la clave.
const REVIEW_STATUSES = new Set(['draft', 'pending_review', 'approved', 'rejected', 'suspended']);
const IDENTITY_REASONS = new Set(['issuer_missing', 'credentials_missing', 'contract_pending', 'not_checked',
  'last_check_mismatch', 'credentials_changed', 'rut_changed']);

function publicConnection(row) {
  if (!row) {
    return {
      connected: false, issuerRut: null, enabled: false, verified: false, keyVersion: null, updatedAt: null,
      reviewStatus: 'draft', reviewNote: null, submittedAt: null, reviewedAt: null,
      resolucionNumero: null, resolucionFecha: null, sucursalNombre: null, sucursalCodigo: null,
      defaultTaxCategory: null, identityVerified: false, identityBlockReason: 'credentials_missing',
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
    defaultTaxCategory: TAX_CATEGORIES.has(row.defaultTaxCategory) ? row.defaultTaxCategory : null,
    // Migración H: la API key verificada contra el RUT (sin esto no se emite).
    identityVerified: row.identityVerified === true,
    identityBlockReason: IDENTITY_REASONS.has(row.identityBlockReason) ? row.identityBlockReason : null,
  };
}

// identityProvider: adaptador de DTE Core con verifyIdentity (lib/identity.mjs). El real declara
// identityContractVerified = false: sin contrato documentado no se llama a la red.
export function createFiscalConnectionService({ admin, masterKey, allowedIssuers,
  identityProvider = createSiisolutionsHttpProvider() }) {
  if (!admin || typeof admin.rpc !== 'function') throw new Error('admin client with rpc required');
  if (!masterKey) throw new Error('master key required');
  if (!isAllowlist(allowedIssuers)) throw new Error('allowedIssuers required (fail-closed)');
  const NOT_ALLOWED = () => fail(403, 'FISCAL_BUSINESS_NOT_ALLOWED');

  async function readStatus(businessId) {
    const { data, error } = await admin.rpc('crm_fiscal_connection_status', { p_business_id: businessId });
    if (error) return { ok: false, ...mapDbError(error) };
    return { ok: true, connection: publicConnection(data) };
  }

  // allowed: el negocio está en la lista del servidor (la pantalla oculta el formulario si no).
  // No revela qué RUT espera la lista.
  async function status({ businessId }) {
    const r = await readStatus(businessId);
    if (!r.ok) return { status: r.status, body: r.body };
    return { status: 200, body: { connection: r.connection, allowed: allowedIssuers.permitsBusiness(businessId) } };
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

  // Vinculación fiscal: Walinka pregunta al proveedor a qué RUT pertenece la API key y la base lo
  // compara con el RUT del comercio (crm_fiscal_record_identity_check). El RUT que escribe el
  // comercio nunca basta: sin coincidencia no se aprueba ni se emite.
  //   'match' | 'mismatch' | 'unavailable' | 'contract_pending' (sin contrato: no se llama a la red)
  async function verifyIdentity(businessId, actorId, apiKey) {
    const r = await resolveKeyOwnerRut({ provider: identityProvider, apiKey });
    if (r.status === 'contract_pending') return { identity: 'contract_pending' };
    const { data, error } = await admin.rpc('crm_fiscal_record_identity_check', {
      p_business_id: businessId,
      p_actor_user_id: actorId,
      p_observed_rut: r.status === 'resolved' ? r.rut : null,
      p_detail: r.status === 'resolved' ? {} : { reason: r.reason },
    });
    if (error) {
      if (String(error.message ?? '').includes('FISCAL_IDENTITY_CONTRACT_PENDING')) return { identity: 'contract_pending' };
      return { failed: mapDbError(error) };
    }
    return { identity: ['match', 'mismatch', 'unavailable'].includes(data?.outcome) ? data.outcome : 'unavailable' };
  }

  // Guarda la API key y la verifica en el mismo paso. Un RUT distinto rechaza la configuración:
  // queda registrado, el emisor sigue sin aprobar y no se emite.
  async function saveAndVerify(businessId, actorId, issuerRut, apiKey) {
    const failed = await saveCredentials(businessId, actorId, issuerRut, apiKey);
    if (failed) return { failed };
    const v = await verifyIdentity(businessId, actorId, apiKey);
    if (v.failed) return v;
    if (v.identity === 'mismatch') return { failed: fail(409, 'IDENTITY_MISMATCH') };
    return v;
  }

  async function connect({ businessId, actorId, body }) {
    for (const key of Object.keys(body)) {
      if (!CONNECT_FIELDS.has(key)) return fail(400, 'UNKNOWN_FIELD');
    }
    const issuerRut = normalizeRut(body.issuerRut);
    if (!issuerRut) return fail(400, 'INVALID_RUT');
    if (!allowedIssuers.permits(businessId, issuerRut)) return NOT_ALLOWED();
    const apiKey = validateApiKey(body.apiKey);
    if (!apiKey) return fail(400, 'INVALID_API_KEY');
    const v = await saveAndVerify(businessId, actorId, issuerRut, apiKey);
    if (v.failed) return v.failed;

    const r = await readStatus(businessId);
    if (!r.ok) return { status: r.status, body: r.body };
    return { status: 200, body: { connection: r.connection, identity: v.identity } };
  }

  // Vuelve a verificar la API key guardada (p. ej. si el proveedor no respondió, o cuando DTE Core
  // documente su endpoint de identidad). La clave se descifra solo aquí, en el servidor.
  async function verify({ businessId, actorId, body }) {
    for (const key of Object.keys(body)) {
      if (!VERIFY_FIELDS.has(key)) return fail(400, 'UNKNOWN_FIELD');
    }
    if (!allowedIssuers.permitsBusiness(businessId)) return NOT_ALLOWED();
    const { data, error } = await admin.rpc('crm_fiscal_get_credentials', { p_business_id: businessId });
    if (error) return mapDbError(error);
    if (!data) return fail(409, 'API_KEY_REQUIRED');
    let apiKey;
    try {
      apiKey = open(mapCredentialRecord(data), { key: masterKey, businessId }).apiKey;
    } catch {
      return fail(503, 'SERVER_ERROR');
    }
    const v = await verifyIdentity(businessId, actorId, apiKey);
    if (v.failed) return v.failed;
    if (v.identity === 'mismatch') return fail(409, 'IDENTITY_MISMATCH');
    const r = await readStatus(businessId);
    if (!r.ok) return { status: r.status, body: r.body };
    return { status: 200, body: { connection: r.connection, identity: v.identity } };
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
    if (!allowedIssuers.permits(businessId, issuerRut)) return NOT_ALLOWED();
    const resolucion = validateResolucion(body.resolucionNumero, body.resolucionFecha);
    if (!resolucion) return fail(400, 'INVALID_RESOLUCION');
    const sucursal = validateSucursal(body.sucursalNombre, body.sucursalCodigo);
    if (!sucursal) return fail(400, 'INVALID_SUCURSAL');

    const hasKey = typeof body.apiKey === 'string' && body.apiKey.trim() !== '';
    if (hasKey) {
      const apiKey = validateApiKey(body.apiKey);
      if (!apiKey) return fail(400, 'INVALID_API_KEY');
      const v = await saveAndVerify(businessId, actorId, issuerRut, apiKey);
      if (v.failed) return v.failed;
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

  // Tratamiento tributario por defecto del negocio (productos sin categoría y artículos manuales).
  async function setTaxDefault({ businessId, actorId, body }) {
    for (const key of Object.keys(body)) {
      if (!TAX_DEFAULT_FIELDS.has(key)) return fail(400, 'UNKNOWN_FIELD');
    }
    if (!allowedIssuers.permitsBusiness(businessId)) return NOT_ALLOWED();
    const category = body.category === null || body.category === '' ? null : body.category;
    if (category !== null && !TAX_CATEGORIES.has(category)) return fail(400, 'INVALID_TAX_CATEGORY');
    const { error } = await admin.rpc('crm_fiscal_set_tax_default', {
      p_business_id: businessId, p_actor_user_id: actorId, p_category: category,
    });
    if (error) return mapDbError(error);
    const r = await readStatus(businessId);
    if (!r.ok) return { status: r.status, body: r.body };
    return { status: 200, body: { connection: r.connection } };
  }

  return Object.freeze({ status, connect, verify, submit, setTaxDefault, disconnect });
}
