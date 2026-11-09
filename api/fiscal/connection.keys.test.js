// Manejador real de /api/fiscal/connection con distintas configuraciones de clave.
// - Ya no lee FISCAL_MASTER_KEY (hoy tiene un valor ajeno): su contenido no afecta nada.
// - Sin FISCAL_MASTER_KEY_V2 verificada, el endpoint responde (401 sin sesión) en vez de 503;
//   solo guardar una API key queda bloqueado (probado en keyring.test.mjs).
// - El registro de errores informa el estado, nunca el valor de la clave ni su KCV.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import handler from './connection.js';
import { keyCheckValue } from '../../supabase/functions/fiscal-emit/lib/secrets.mjs';

const BIZ = 'cda904a1-e331-4bd4-9f33-a6715687d3dd';
const KEYS = ['FISCAL_MASTER_KEY', 'FISCAL_MASTER_KEY_V2', 'FISCAL_MASTER_KEY_V2_KCV', 'VITE_SUPABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'FISCAL_ALLOWED_ISSUERS'];

function fakeRes() {
  const res = { headers: {}, statusCode: 200, payload: undefined };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.payload = b; return res; };
  return res;
}

async function run(env) {
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  const logs = [];
  const origError = console.error;
  console.error = (...a) => logs.push(a.map(String).join(' '));
  try {
    for (const k of KEYS) delete process.env[k];
    Object.assign(process.env, { SUPABASE_URL: 'http://127.0.0.1:9', SUPABASE_SERVICE_ROLE_KEY: 'test-service-role', FISCAL_ALLOWED_ISSUERS: `${BIZ}=77804207-K` }, env);
    const res = fakeRes();
    await handler({ method: 'GET', query: { businessId: BIZ }, headers: {} }, res);
    return { res, logs: logs.join('\n') };
  } finally {
    console.error = origError;
    for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}

test('FISCAL_MASTER_KEY con un valor ajeno ya no deja el endpoint en 503', async () => {
  const { res } = await run({ FISCAL_MASTER_KEY: 'sk_live_valor_ajeno_de_otro_servicio' });
  assert.equal(res.statusCode, 401);
  assert.equal(res.payload.error, 'AUTH_HEADER_MISSING');
});

test('V2 ausente, inválida o con KCV distinto: el endpoint responde; el log da el estado sin valores', async () => {
  const k2 = randomBytes(32).toString('base64');
  const otherKcv = keyCheckValue(randomBytes(32));
  for (const [env, status] of [
    [{}, 'missing'],
    [{ FISCAL_MASTER_KEY_V2: 'sk_live_no_es_una_clave', FISCAL_MASTER_KEY_V2_KCV: otherKcv }, 'invalid'],
    [{ FISCAL_MASTER_KEY_V2: k2 }, 'kcv_missing'],
    [{ FISCAL_MASTER_KEY_V2: k2, FISCAL_MASTER_KEY_V2_KCV: otherKcv }, 'kcv_mismatch'],
  ]) {
    const { res, logs } = await run(env);
    assert.equal(res.statusCode, 401, status);
    assert.match(logs, new RegExp(`clave de cifrado V2 no disponible ${status}`));
    for (const v of Object.values(env)) assert.ok(!logs.includes(v), `el log no repite ${status}`);
    assert.ok(!JSON.stringify(res.payload).includes(k2));
  }
});

test('V2 verificada: sin mensajes de error de clave y sin el valor en ninguna salida', async () => {
  const raw = randomBytes(32);
  const k2 = raw.toString('base64');
  const { res, logs } = await run({ FISCAL_MASTER_KEY_V2: k2, FISCAL_MASTER_KEY_V2_KCV: keyCheckValue(raw) });
  assert.equal(res.statusCode, 401);
  assert.ok(!logs.includes('clave de cifrado V2'));
  assert.ok(!logs.includes(k2) && !JSON.stringify(res.payload).includes(k2));
});
