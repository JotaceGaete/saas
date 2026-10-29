// SERVER ONLY. Low-level cryptographic primitives for SII certification.
// This is NOT a complete XMLDSig/TED generator: canonicalization, exact DD
// serialization, CAF authenticity and schema placement must be verified first.
import { createPrivateKey, createPublicKey, sign, verify, X509Certificate, constants } from 'node:crypto';

const algorithms = Object.freeze({
  'RSA-SHA1': 'RSA-SHA1',
  'RSA-SHA256': 'RSA-SHA256'
});
function getAlgorithm(value) {
  if (!Object.hasOwn(algorithms, value)) throw new Error('Algoritmo de firma no permitido');
  return algorithms[value];
}
function getPrivateKey(pem) {
  if (typeof pem !== 'string' || !pem.includes('PRIVATE KEY')) throw new Error('Clave privada PEM inválida');
  const key = createPrivateKey(pem);
  if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) {
    throw new Error('Se requiere RSA de al menos 2048 bits');
  }
  return key;
}
function getPublicKey(pem) {
  if (typeof pem !== 'string') throw new Error('Clave pública PEM inválida');
  const key = createPublicKey(pem);
  if (key.asymmetricKeyType !== 'rsa') throw new Error('Clave pública RSA requerida');
  return key;
}
function dataBuffer(value) {
  if (!Buffer.isBuffer(value) || value.length === 0 || value.length > 1024 * 1024) {
    throw new Error('Datos canónicos ausentes o demasiado grandes');
  }
  return value;
}
export function signCanonicalBytes({ canonicalBytes, privateKeyPem, algorithm }) {
  const key = getPrivateKey(privateKeyPem);
  const signature = sign(getAlgorithm(algorithm), dataBuffer(canonicalBytes), { key, padding: constants.RSA_PKCS1_PADDING });
  return signature.toString('base64');
}
export function verifyCanonicalBytes({ canonicalBytes, publicKeyPem, signatureBase64, algorithm }) {
  const key = getPublicKey(publicKeyPem);
  if (typeof signatureBase64 !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(signatureBase64)) {
    throw new Error('Firma Base64 inválida');
  }
  return verify(getAlgorithm(algorithm), dataBuffer(canonicalBytes), { key, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(signatureBase64, 'base64'));
}
export function inspectSignerCertificate(certificatePem, now = new Date()) {
  if (typeof certificatePem !== 'string' || !certificatePem.includes('BEGIN CERTIFICATE')) throw new Error('Certificado PEM requerido');
  const cert = new X509Certificate(certificatePem);
  if (cert.publicKey.asymmetricKeyType !== 'rsa') throw new Error('Certificado no RSA');
  const at = now.getTime();
  if (!Number.isFinite(at) || at < Date.parse(cert.validFrom) || at > Date.parse(cert.validTo)) {
    throw new Error('Certificado fuera de vigencia');
  }
  return Object.freeze({
    fingerprint256: cert.fingerprint256,
    validFrom: cert.validFrom,
    validTo: cert.validTo,
    publicKeyPem: cert.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  });
}
