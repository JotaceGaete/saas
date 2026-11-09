// Cifrado de credenciales tributarias por comercio (AES-256-GCM).
// - La clave maestra vive en el entorno del servidor (FISCAL_MASTER_KEY, 32 bytes en base64).
// - El AAD liga el texto cifrado a (business_id, proveedor, versión): copiar una fila a otro
//   comercio hace fallar la descifrada.
// - Nunca se devuelve el secreto al frontend: estas funciones solo las usa el emisor.

// Buffer se importa explícitamente: el runtime de Supabase Edge no lo expone como global.
import { Buffer } from 'node:buffer';
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { FiscalError } from './errors.mjs';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

export function parseMasterKey(b64) {
  if (typeof b64 !== 'string' || b64.length === 0) {
    throw new FiscalError('MASTER_KEY_MISSING');
  }
  const key = Buffer.from(b64, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new FiscalError('MASTER_KEY_INVALID', 'master key must be 32 bytes base64');
  }
  return key;
}

function aadFor({ businessId, provider = 'dtecore', keyVersion = 1 }) {
  if (!businessId) throw new FiscalError('AAD_INVALID', 'businessId required');
  return Buffer.from(`${businessId}|${provider}|${keyVersion}`, 'utf8');
}

export function seal(plaintextObj, { key, businessId, provider = 'dtecore', keyVersion = 1 }) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(aadFor({ businessId, provider, keyVersion }));
  const plaintext = Buffer.from(JSON.stringify(plaintextObj), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext, iv, authTag, keyVersion, provider };
}

export function open(record, { key, businessId }) {
  if (!record || !record.ciphertext || record.iv?.length !== IV_BYTES || record.authTag?.length !== TAG_BYTES) {
    throw new FiscalError('CREDENTIAL_INVALID');
  }
  try {
    const decipher = createDecipheriv(ALGO, key, record.iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(aadFor({ businessId, provider: record.provider, keyVersion: record.keyVersion }));
    decipher.setAuthTag(record.authTag);
    const plaintext = Buffer.concat([decipher.update(record.ciphertext), decipher.final()]);
    return JSON.parse(plaintext.toString('utf8'));
  } catch {
    // Mensaje deliberadamente genérico: no revelar si fue clave, AAD o manipulación.
    throw new FiscalError('CREDENTIAL_INVALID');
  }
}

// ---------------------------------------------------------------------------------------------
// Dos claves maestras por versión (rotación sin re-registrar credenciales).
//
// - Versión 1: FISCAL_MASTER_KEY (la original). Descifra las credenciales existentes. Nunca se
//   reemplaza mientras haya credenciales o respaldos de versión 1.
// - Versión 2: FISCAL_MASTER_KEY_V2. Vercel cifra con ella los registros nuevos (key_version=2) y
//   fiscal-emit la usa para descifrarlos.
// - La V2 solo se usa si su valor de comprobación (KCV) coincide con FISCAL_MASTER_KEY_V2_KCV,
//   configurado igual en Vercel y en Supabase. Así cada plataforma verifica, sin ver la otra, que
//   tiene exactamente la misma clave. El KCV es un HMAC-SHA256 de una etiqueta fija con la clave:
//   no permite recuperarla.
// - Falla cerrado: clave ausente, inválida, sin KCV, con KCV distinto, igual a la V1 o versión
//   desconocida => esa versión no se puede usar (CREDENTIAL_KEY_UNAVAILABLE). Nunca se prueba
//   «otra clave» como respaldo.
// - Ningún valor de clave ni KCV calculado se registra ni se devuelve: solo estados.

export const KCV_LABEL = 'walinka-fiscal-master-key-check-v1';
const KCV_HEX = /^[0-9a-f]{32}$/;

/** Valor de comprobación de una clave (32 hex). No revela la clave. */
export function keyCheckValue(key) {
  if (!Buffer.isBuffer(key) || key.length !== KEY_BYTES) throw new FiscalError('MASTER_KEY_INVALID');
  return createHmac('sha256', key).update(KCV_LABEL, 'utf8').digest('hex').slice(0, 32);
}

function kcvMatches(key, expected) {
  const want = String(expected ?? '').trim().toLowerCase();
  if (!KCV_HEX.test(want)) return false;
  return timingSafeEqual(Buffer.from(keyCheckValue(key), 'hex'), Buffer.from(want, 'hex'));
}

/**
 * @param {{ v2?: string, v2Kcv?: string, v1Key?: Uint8Array | null }} [opts]
 * Estado de la clave V2 sin lanzar: 'ok' | 'missing' | 'invalid' | 'kcv_missing' | 'kcv_mismatch'
 * | 'same_as_v1'. `key` solo viene con 'ok'.
 */
export function resolveKeyV2({ v2, v2Kcv, v1Key = null } = {}) {
  if (typeof v2 !== 'string' || v2.trim() === '') return { status: 'missing', key: null };
  let key;
  try { key = parseMasterKey(v2.trim()); } catch { return { status: 'invalid', key: null }; }
  if (typeof v2Kcv !== 'string' || v2Kcv.trim() === '') return { status: 'kcv_missing', key: null };
  if (!kcvMatches(key, v2Kcv)) return { status: 'kcv_mismatch', key: null };
  if (v1Key && timingSafeEqual(key, v1Key)) return { status: 'same_as_v1', key: null };
  return { status: 'ok', key };
}

/**
 * @param {{ v1?: string | Uint8Array, v2?: string, v2Kcv?: string }} [opts]
 * Llavero de fiscal-emit. v1 es obligatoria (lanza MASTER_KEY_MISSING/INVALID como antes); v2 es
 * opcional y solo entra si resolveKeyV2 da 'ok'.
 */
export function buildKeyring({ v1, v2, v2Kcv } = {}) {
  const k1 = Buffer.isBuffer(v1) ? v1 : parseMasterKey(v1);
  if (k1.length !== KEY_BYTES) throw new FiscalError('MASTER_KEY_INVALID');
  const r2 = resolveKeyV2({ v2, v2Kcv, v1Key: k1 });
  const keys = new Map([[1, k1]]);
  if (r2.key) keys.set(2, r2.key);
  return Object.freeze({
    /** Clave de esa versión o null (versión desconocida o no configurada). */
    keyFor: (version) => keys.get(version) ?? null,
    status: Object.freeze({ v1: 'ok', v2: r2.status }),
  });
}

/** Descifra con la clave de la versión del registro. Sin clave para esa versión: CREDENTIAL_KEY_UNAVAILABLE. */
export function openWithKeyring(record, { keyring, businessId }) {
  const key = keyring?.keyFor?.(record?.keyVersion);
  if (!key) throw new FiscalError('CREDENTIAL_KEY_UNAVAILABLE');
  return open(record, { key, businessId });
}
