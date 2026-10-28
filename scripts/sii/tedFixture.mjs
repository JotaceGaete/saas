// Offline TED fixture assembler. This is NOT an SII-compliant TED generator.
// It signs caller-supplied, previously serialized DD bytes; caller must provide
// CAF private key server-side and validate CAF authorization independently.
// Never use in the browser or production emission path.
import { signCanonicalBytes, verifyCanonicalBytes } from './crypto-engine.mjs';

function escapeAttr(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9-]{1,30}$/.test(value)) throw new Error('Algoritmo TED inválido');
  return value;
}
function requireDd(value) {
  if (!Buffer.isBuffer(value) || value.length < 5 || value.length > 200000) throw new Error('DD serializado inválido');
  const text = value.toString('utf8');
  if (!text.startsWith('<DD>') || !text.endsWith('</DD>')) throw new Error('DD debe ser un fragmento XML exacto');
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('DTD prohibido');
  return text;
}
/**
 * Fixture only: no CAF signature verification, canonicalization or XSD validation.
 * Input DD must have been constructed with the exact SII-required serialization
 * and validated against official schemas outside this helper.
 */
export function assembleTedFixture({ serializedDd, cafPrivateKeyPem, cafPublicKeyPem }) {
  const dd = requireDd(serializedDd);
  const signatureBase64 = signCanonicalBytes({
    canonicalBytes: serializedDd,
    privateKeyPem: cafPrivateKeyPem,
    algorithm: 'RSA-SHA1'
  });
  const verified = verifyCanonicalBytes({
    canonicalBytes: serializedDd,
    publicKeyPem: cafPublicKeyPem,
    signatureBase64,
    algorithm: 'RSA-SHA1'
  });
  if (!verified) throw new Error('Clave CAF pública/privada no coinciden');
  const algorithm = escapeAttr('SHA1withRSA');
  return Object.freeze({
    status: 'fixture_only',
    signatureBase64,
    tedXml: `<TED version="1.0">${dd}<FRMT algoritmo="${algorithm}">${signatureBase64}</FRMT></TED>`
  });
}
