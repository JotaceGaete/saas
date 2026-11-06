// Arranque con configuración incompleta: la función no cae, respeta CORS y no toca base ni proveedor.
// El diagnóstico informa nombres y presencia, nunca valores.
import { strictEqual as assertEquals, deepStrictEqual, ok as assert, throws } from 'node:assert';
import { buildFiscalHandler, buildUnconfiguredHandler, describeFiscalEnv, type FiscalDbClient } from '../../app.ts';
import { createDtecoreBlockedProvider } from '../../lib/providers/dtecore-blocked.mjs';

const PROD = 'https://go.walinka.com';
const SECRET_VALUE = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=';

Deno.test('sin FISCAL_MASTER_KEY el manejador real no se construye (falla cerrado)', () => {
  const db = { rpc: async () => ({ data: null, error: null }), from: () => ({}), auth: { getUser: async () => ({ data: { user: null }, error: null }) } } as unknown as FiscalDbClient;
  throws(() => buildFiscalHandler({ db, provider: createDtecoreBlockedProvider(), masterKey: undefined }), /MASTER_KEY_MISSING/);
});

Deno.test('respaldo: OPTIONS desde origen permitido -> 204 con CORS', async () => {
  const r = await buildUnconfiguredHandler()(new Request('https://x.test/', { method: 'OPTIONS', headers: { origin: PROD, 'access-control-request-method': 'POST' } }));
  assertEquals(r.status, 204);
  assertEquals(r.headers.get('access-control-allow-origin'), PROD);
  assertEquals(r.headers.get('vary'), 'Origin');
});

Deno.test('respaldo: origen no permitido -> 403 sin cabeceras CORS', async () => {
  for (const method of ['OPTIONS', 'POST']) {
    const r = await buildUnconfiguredHandler()(new Request('https://x.test/', { method, headers: { origin: 'https://evil.example' }, body: method === 'POST' ? '{}' : undefined }));
    assertEquals(r.status, 403);
    assertEquals(r.headers.get('access-control-allow-origin'), null);
    assertEquals((await r.json()).error, 'ORIGIN_NOT_ALLOWED');
  }
});

Deno.test('respaldo: POST (emit) -> 503 FISCAL_NOT_CONFIGURED con CORS, nunca emite', async () => {
  const r = await buildUnconfiguredHandler()(new Request('https://x.test/', {
    method: 'POST', headers: { origin: PROD, authorization: 'Bearer good', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'emit', saleId: '22222222-2222-4222-8222-222222222222' }),
  }));
  assertEquals(r.status, 503);
  assertEquals(r.headers.get('access-control-allow-origin'), PROD);
  assertEquals(r.headers.get('cache-control'), 'no-store');
  assertEquals((await r.json()).error, 'FISCAL_NOT_CONFIGURED');
});

Deno.test('diagnóstico: informa presencia y faltantes sin exponer valores', () => {
  const env: Record<string, string> = { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'srk-value', FISCAL_MASTER_KEY: SECRET_VALUE, FISCAL_ALLOWED_ISSUERS: '   ' };
  const d = describeFiscalEnv((n) => env[n]);
  deepStrictEqual(d.missing, ['FISCAL_ALLOWED_ISSUERS']);
  assertEquals(d.present.FISCAL_MASTER_KEY, true);
  assertEquals(d.fiscalProviderSet, false);
  assertEquals(d.providerMode, 'blocked');
  const text = JSON.stringify(d);
  for (const v of [SECRET_VALUE, 'srk-value', 'https://p.supabase.co']) assert(!text.includes(v), v);
});

Deno.test('diagnóstico: modo de proveedor solo es dtecore con dtecore|siisolutions', () => {
  for (const [v, mode] of [['dtecore', 'dtecore'], ['siisolutions', 'dtecore'], ['DTECORE', 'blocked'], ['simulated', 'blocked'], ['', 'blocked']]) {
    assertEquals(describeFiscalEnv((n) => (n === 'FISCAL_PROVIDER' ? v : undefined)).providerMode, mode, v);
  }
});
