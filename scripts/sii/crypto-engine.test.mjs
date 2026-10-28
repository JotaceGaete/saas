import { describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { signCanonicalBytes, verifyCanonicalBytes } from './crypto-engine.mjs';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});
const canonicalBytes = Buffer.from('<DD><RE>12345678-5</RE></DD>', 'utf8');

describe('primitivas de firma aisladas (no DTE)', () => {
  it('firma y verifica bytes idénticos con RSA-SHA1 para ensayo de TED', () => {
    const signatureBase64 = signCanonicalBytes({ canonicalBytes, privateKeyPem: privateKey, algorithm: 'RSA-SHA1' });
    expect(verifyCanonicalBytes({ canonicalBytes, publicKeyPem: publicKey, signatureBase64, algorithm: 'RSA-SHA1' })).toBe(true);
    expect(verifyCanonicalBytes({ canonicalBytes: Buffer.from('alterado'), publicKeyPem: publicKey, signatureBase64, algorithm: 'RSA-SHA1' })).toBe(false);
  });
  it('admite SHA256 para ensayos de firma XML, pero no inventa XMLDSig', () => {
    const signatureBase64 = signCanonicalBytes({ canonicalBytes, privateKeyPem: privateKey, algorithm: 'RSA-SHA256' });
    expect(verifyCanonicalBytes({ canonicalBytes, publicKeyPem: publicKey, signatureBase64, algorithm: 'RSA-SHA256' })).toBe(true);
  });
  it('rechaza algoritmo arbitrario y datos no canónicos vacíos', () => {
    expect(() => signCanonicalBytes({ canonicalBytes, privateKeyPem: privateKey, algorithm: 'MD5' })).toThrow();
    expect(() => signCanonicalBytes({ canonicalBytes: Buffer.alloc(0), privateKeyPem: privateKey, algorithm: 'RSA-SHA1' })).toThrow();
  });
});
