import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { seal, open, parseMasterKey } from '../../lib/secrets.mjs';

const KEY = randomBytes(32);
const B1 = '11111111-1111-1111-1111-111111111111';
const B2 = '22222222-2222-2222-2222-222222222222';
const SECRET = { apiKey: 'sk_live_TEST_SECRET_VALUE_123456' };

test('roundtrip: abrir con la misma clave y comercio devuelve el secreto', () => {
  const rec = seal(SECRET, { key: KEY, businessId: B1 });
  assert.deepEqual(open(rec, { key: KEY, businessId: B1 }), SECRET);
});

test('el texto cifrado no contiene el secreto en claro', () => {
  const rec = seal(SECRET, { key: KEY, businessId: B1 });
  assert.equal(rec.ciphertext.includes(Buffer.from(SECRET.apiKey)), false);
  assert.equal(rec.ciphertext.toString('utf8').includes('sk_live'), false);
});

test('IV de 12 bytes y tag de 16 bytes, y nunca se repite entre cifrados', () => {
  const a = seal(SECRET, { key: KEY, businessId: B1 });
  const b = seal(SECRET, { key: KEY, businessId: B1 });
  assert.equal(a.iv.length, 12);
  assert.equal(a.authTag.length, 16);
  assert.notDeepEqual(a.iv, b.iv);
});

test('manipular el texto cifrado hace fallar la apertura', () => {
  const rec = seal(SECRET, { key: KEY, businessId: B1 });
  const tampered = { ...rec, ciphertext: Buffer.from(rec.ciphertext) };
  tampered.ciphertext[0] ^= 0x01;
  assert.throws(() => open(tampered, { key: KEY, businessId: B1 }), { code: 'CREDENTIAL_INVALID' });
});

test('manipular el tag hace fallar la apertura', () => {
  const rec = seal(SECRET, { key: KEY, businessId: B1 });
  const tag = Buffer.from(rec.authTag);
  tag[15] ^= 0xff;
  assert.throws(() => open({ ...rec, authTag: tag }, { key: KEY, businessId: B1 }), { code: 'CREDENTIAL_INVALID' });
});

test('copiar la fila de un comercio a otro falla (AAD ligado al business_id)', () => {
  const rec = seal(SECRET, { key: KEY, businessId: B1 });
  assert.throws(() => open(rec, { key: KEY, businessId: B2 }), { code: 'CREDENTIAL_INVALID' });
});

test('clave incorrecta falla con error genérico', () => {
  const rec = seal(SECRET, { key: KEY, businessId: B1 });
  assert.throws(() => open(rec, { key: randomBytes(32), businessId: B1 }), (e) => {
    assert.equal(e.code, 'CREDENTIAL_INVALID');
    assert.equal(e.message.includes('key'), false);
    return true;
  });
});

test('IV o tag con longitud incorrecta se rechazan antes de descifrar', () => {
  const rec = seal(SECRET, { key: KEY, businessId: B1 });
  assert.throws(() => open({ ...rec, iv: rec.iv.subarray(0, 11) }, { key: KEY, businessId: B1 }), { code: 'CREDENTIAL_INVALID' });
  assert.throws(() => open({ ...rec, authTag: rec.authTag.subarray(0, 15) }, { key: KEY, businessId: B1 }), { code: 'CREDENTIAL_INVALID' });
});

test('clave maestra: exige 32 bytes en base64', () => {
  assert.equal(parseMasterKey(randomBytes(32).toString('base64')).length, 32);
  assert.throws(() => parseMasterKey(undefined), { code: 'MASTER_KEY_MISSING' });
  assert.throws(() => parseMasterKey(randomBytes(16).toString('base64')), { code: 'MASTER_KEY_INVALID' });
});
