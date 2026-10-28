import { describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { assembleTedFixture } from './tedFixture.mjs';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});
const serializedDd = Buffer.from('<DD><RE>12345678-5</RE><TD>39</TD></DD>', 'utf8');

describe('ensamblado de TED solo para ensayos', () => {
  it('firma bytes DD y verifica contra la clave pública correspondiente', () => {
    const result = assembleTedFixture({ serializedDd, cafPrivateKeyPem: privateKey, cafPublicKeyPem: publicKey });
    expect(result.status).toBe('fixture_only');
    expect(result.tedXml).toContain('<FRMT algoritmo="SHA1withRSA">');
    expect(result.tedXml).toContain('<DD><RE>12345678-5</RE>');
  });
  it('rechaza clave CAF distinta', () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
    expect(() => assembleTedFixture({ serializedDd, cafPrivateKeyPem: privateKey, cafPublicKeyPem: other.publicKey })).toThrow();
  });
  it('rechaza DD que no sea un fragmento exacto', () => {
    expect(() => assembleTedFixture({ serializedDd: Buffer.from('<xml/>'), cafPrivateKeyPem: privateKey, cafPublicKeyPem: publicKey })).toThrow();
  });
});
