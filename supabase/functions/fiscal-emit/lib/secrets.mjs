// Cifrado de credenciales tributarias por comercio (AES-256-GCM).
// - La clave maestra vive en el entorno del servidor (FISCAL_MASTER_KEY, 32 bytes en base64).
// - El AAD liga el texto cifrado a (business_id, proveedor, versión): copiar una fila a otro
//   comercio hace fallar la descifrada.
// - Nunca se devuelve el secreto al frontend: estas funciones solo las usa el emisor.

// Buffer se importa explícitamente: el runtime de Supabase Edge no lo expone como global.
import { Buffer } from 'node:buffer';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
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
