// Verificación de la firma del timbre (FRMT) con la clave pública del CAF.
//
// Qué prueba: que el DD (datos del timbre) fue firmado con la clave privada
// del CAF que viene dentro del mismo timbre, es decir, que el timbre no fue
// alterado después de emitido.
// Qué NO prueba: que el CAF lo haya autorizado el SII (eso requiere la clave
// pública del SII que firma el CAF, campo FRMA) ni que el SII haya aceptado
// el documento. Esos estados se consultan en el proveedor o en sii.cl.
//
// Se implementa con BigInt (RSASSA-PKCS1-v1_5 + SHA-1) en vez de
// `crypto.subtle.importKey`, porque los CAF del SII usan claves de 512 bits
// con exponente 3 y algunos navegadores rechazan importar claves tan cortas.
// SHA-1 se calcula con `crypto.subtle.digest`, disponible en todos.

// DigestInfo DER de SHA-1 (RFC 8017, sección 9.2, nota 1).
const SHA1_DIGEST_INFO = [0x30, 0x21, 0x30, 0x09, 0x06, 0x05, 0x2b, 0x0e, 0x03, 0x02, 0x1a, 0x05, 0x00, 0x04, 0x14];

function base64ToBytes(b64) {
  const clean = String(b64 || '').replace(/\s+/g, '');
  if (!clean || clean.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) return null;
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBigInt(bytes) {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return n;
}

function bigIntToBytes(n, length) {
  const out = new Uint8Array(length);
  for (let i = length - 1; i >= 0; i--) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return n === 0n ? out : null;
}

function modPow(base, exp, mod) {
  let result = 1n;
  let b = base % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % mod;
    b = (b * b) % mod;
    e >>= 1n;
  }
  return result;
}

function latin1Bytes(str) {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code > 0xff) return null;
    out[i] = code;
  }
  return out;
}

/**
 * @param {{ ddXml: string, frmt: string, caf: { modulus: string, exponent: string } }} ted
 * @param {{ subtle?: SubtleCrypto }} [options]
 * @returns {Promise<boolean>} true solo si la firma es válida
 */
export async function verifyTedSignature(ted, { subtle = globalThis.crypto?.subtle } = {}) {
  if (!ted || !subtle) return false;
  const modulusBytes = base64ToBytes(ted.caf?.modulus);
  const exponentBytes = base64ToBytes(ted.caf?.exponent);
  const signature = base64ToBytes(ted.frmt);
  const data = latin1Bytes(ted.ddXml || '');
  if (!modulusBytes || !exponentBytes || !signature || !data) return false;

  const n = bytesToBigInt(modulusBytes);
  const e = bytesToBigInt(exponentBytes);
  const k = modulusBytes[0] === 0 ? modulusBytes.length - 1 : modulusBytes.length;
  if (n === 0n || e === 0n || signature.length !== k) return false;
  const s = bytesToBigInt(signature);
  if (s >= n) return false;

  const em = bigIntToBytes(modPow(s, e, n), k);
  if (!em) return false;

  const digest = new Uint8Array(await subtle.digest('SHA-1', data));
  const tLen = SHA1_DIGEST_INFO.length + digest.length;
  const psLen = k - tLen - 3;
  if (psLen < 8) return false;
  const expected = new Uint8Array(k);
  expected[0] = 0x00;
  expected[1] = 0x01;
  expected.fill(0xff, 2, 2 + psLen);
  expected[2 + psLen] = 0x00;
  expected.set(SHA1_DIGEST_INFO, 3 + psLen);
  expected.set(digest, 3 + psLen + SHA1_DIGEST_INFO.length);

  let diff = 0;
  for (let i = 0; i < k; i++) diff |= em[i] ^ expected[i];
  return diff === 0;
}
