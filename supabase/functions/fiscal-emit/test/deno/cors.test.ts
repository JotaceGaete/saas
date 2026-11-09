// CORS de fiscal-emit en Deno: preflight, orígenes permitidos y rechazados, cabeceras en errores y
// POST sin autenticación. Cliente de base falso; ninguna prueba llama al proveedor.
import { strictEqual as assertEquals, ok as assert } from 'node:assert';
import { buildFiscalHandler, type FiscalDbClient } from '../../app.ts';
import { createDtecoreBlockedProvider } from '../../lib/providers/dtecore-blocked.mjs';
import { ALLOWED_ORIGINS } from '../../lib/cors.mjs';

const TEST_KEY = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=';
const SALE = '22222222-2222-4222-8222-222222222222';
const PROD = 'https://go.walinka.com';
const PREVIEW_123 = 'https://saas-git-claude-fiscal-multiemp-e530d6-juan-s-projects-afd7e18e.vercel.app';

type Counter = { auth: number; rpc: number; from: number };

function countingDb(c: Counter, opts: { throwOnAuth?: boolean } = {}): FiscalDbClient {
  return {
    auth: {
      getUser: async (token: string) => {
        c.auth++;
        if (opts.throwOnAuth) throw new TypeError('network');
        return { data: { user: token === 'good' ? { id: 'user-a' } : null }, error: null };
      },
    },
    rpc: async () => { c.rpc++; return { data: null, error: null }; },
    from: () => {
      c.from++;
      const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: null }) };
      return q;
    },
  };
}

function handler(c: Counter, opts?: { throwOnAuth?: boolean }) {
  return buildFiscalHandler({ db: countingDb(c, opts), provider: createDtecoreBlockedProvider(), masterKey: TEST_KEY });
}

const zero = (): Counter => ({ auth: 0, rpc: 0, from: 0 });

function preflight(origin: string | null) {
  const headers: Record<string, string> = {
    'access-control-request-method': 'POST',
    'access-control-request-headers': 'authorization, x-client-info, apikey, content-type',
  };
  if (origin) headers.origin = origin;
  return new Request('https://x.test/fiscal-emit', { method: 'OPTIONS', headers });
}

function post(body: unknown, { origin, token }: { origin?: string; token?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (origin) headers.origin = origin;
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request('https://x.test/fiscal-emit', {
    method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function assertCorsFor(r: Response, origin: string) {
  assertEquals(r.headers.get('access-control-allow-origin'), origin);
  assertEquals(r.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
  const allowed = (r.headers.get('access-control-allow-headers') ?? '').split(',').map((h) => h.trim());
  for (const h of ['authorization', 'x-client-info', 'apikey', 'content-type']) assert(allowed.includes(h), h);
  assertEquals(r.headers.get('vary'), 'Origin');
  assertEquals(r.headers.get('access-control-allow-credentials'), null);
}

function assertNoCors(r: Response) {
  assertEquals(r.headers.get('access-control-allow-origin'), null);
  assertEquals(r.headers.get('access-control-allow-methods'), null);
  assertEquals(r.headers.get('access-control-allow-headers'), null);
}

Deno.test('lista de orígenes: exacta, https, sin comodines ni URL por despliegue', () => {
  for (const o of ALLOWED_ORIGINS) {
    const u = new URL(o);
    assertEquals(u.protocol, 'https:');
    assertEquals(u.origin, o);
    assert(!o.includes('*'));
  }
  assert(ALLOWED_ORIGINS.includes(PROD));
  assert(ALLOWED_ORIGINS.includes(PREVIEW_123));
});

Deno.test('OPTIONS desde cada origen permitido -> 204 con CORS, sin autenticar ni tocar la base', async () => {
  for (const origin of ALLOWED_ORIGINS) {
    const c = zero();
    const r = await handler(c)(preflight(origin));
    assertEquals(r.status, 204);
    assertCorsFor(r, origin);
    assertEquals(await r.text(), '');
    assertEquals(c.auth + c.rpc + c.from, 0);
  }
});

Deno.test('OPTIONS desde origen no permitido -> 403 sin cabeceras CORS ni llamadas', async () => {
  for (const origin of [
    'https://evil.example',
    'http://go.walinka.com', // otro esquema
    'https://go.walinka.com.evil.com',
    'https://go.walinka.com:8443',
    'https://saas-rkrr6cixk-juan-s-projects-afd7e18e.vercel.app', // URL por despliegue
    'https://saas-git-otra-rama-juan-s-projects-afd7e18e.vercel.app',
    'https://saas-git-main-juan-s-projects-afd7e18e.vercel.app',
    'https://miralatienda.de',
    'null',
  ]) {
    const c = zero();
    const r = await handler(c)(preflight(origin));
    assertEquals(r.status, 403, origin);
    assertNoCors(r);
    assertEquals(r.headers.get('vary'), 'Origin');
    assertEquals((await r.json()).error, 'ORIGIN_NOT_ALLOWED');
    assertEquals(c.auth + c.rpc + c.from, 0);
  }
});

Deno.test('POST desde origen no permitido, aun con token válido -> 403 antes de autenticar', async () => {
  const c = zero();
  const r = await handler(c)(post({ action: 'emit', saleId: SALE }, { origin: 'https://evil.example', token: 'good' }));
  assertEquals(r.status, 403);
  assertNoCors(r);
  assertEquals((await r.json()).error, 'ORIGIN_NOT_ALLOWED');
  assertEquals(c.auth + c.rpc + c.from, 0);
});

Deno.test('POST sin autenticación desde origen permitido -> 401 con CORS, sin tocar la base', async () => {
  const c = zero();
  const r = await handler(c)(post({ action: 'emit', saleId: SALE }, { origin: PROD }));
  assertEquals(r.status, 401);
  assertCorsFor(r, PROD);
  assertEquals((await r.json()).error, 'UNAUTHENTICATED');
  assertEquals(c.rpc + c.from, 0);
});

Deno.test('POST con token inválido desde Preview #123 -> 401 con CORS', async () => {
  const c = zero();
  const r = await handler(c)(post({ action: 'status', saleId: SALE }, { origin: PREVIEW_123, token: 'bad' }));
  assertEquals(r.status, 401);
  assertCorsFor(r, PREVIEW_123);
  assertEquals(c.rpc + c.from, 0);
});

Deno.test('errores llevan CORS: 400 JSON inválido, 400 campo extra, 404, 405, 500', async () => {
  const cases: Array<[Request, number, string, { throwOnAuth?: boolean }?]> = [
    [post('{nope', { origin: PROD, token: 'good' }), 400, 'BAD_REQUEST'],
    [post({ action: 'emit', saleId: SALE, business_id: 'x' }, { origin: PROD, token: 'good' }), 400, 'UNKNOWN_FIELD'],
    [post({ action: 'emit', saleId: SALE }, { origin: PROD, token: 'good' }), 404, 'SALE_NOT_FOUND'],
    [new Request('https://x.test/', { method: 'GET', headers: { origin: PROD } }), 405, 'METHOD_NOT_ALLOWED'],
    [post({ action: 'emit', saleId: SALE }, { origin: PROD, token: 'good' }), 500, 'INTERNAL', { throwOnAuth: true }],
  ];
  for (const [request, status, code, opts] of cases) {
    const r = await handler(zero(), opts)(request);
    assertEquals(r.status, status, code);
    assertCorsFor(r, PROD);
    assertEquals(r.headers.get('cache-control'), 'no-store');
    assertEquals((await r.json()).error, code);
  }
});

Deno.test('sin cabecera Origin (no navegador): sin CORS, autenticación igual de obligatoria', async () => {
  const c = zero();
  const r = await handler(c)(post({ action: 'emit', saleId: SALE }));
  assertEquals(r.status, 401);
  assertNoCors(r);
  assertEquals(r.headers.get('vary'), 'Origin');
  assertEquals(c.rpc + c.from, 0);
});

Deno.test('venta propia con proveedor bloqueado desde Preview #123 -> 503 PROVIDER_NOT_READY con CORS, sin reclamo', async () => {
  const BIZ = '11111111-1111-4111-8111-111111111111';
  const calls: string[] = [];
  const db: FiscalDbClient = {
    auth: { getUser: async () => ({ data: { user: { id: 'user-a' } }, error: null }) },
    rpc: async (fn: string) => { calls.push(fn); return { data: fn === 'crm_fiscal_actor_role' ? 'fiscal_owner' : null, error: null }; },
    from: (table: string) => {
      const rows: Record<string, unknown> = {
        crm_invoices: { id: SALE, business_id: BIZ, status: 'pagada', paid_at: '2026-10-31T12:00:00Z', total: 2380, discount_amount: 0 },
        wa_businesses: { id: BIZ, user_id: 'user-a', country_code: 'CL' },
      };
      const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: rows[table] ?? null, error: null }) };
      return q;
    },
  };
  const h = buildFiscalHandler({ db, provider: createDtecoreBlockedProvider(), masterKey: TEST_KEY });
  const r = await h(post({ action: 'emit', saleId: SALE }, { origin: PREVIEW_123, token: 'good' }));
  assertEquals(r.status, 503);
  assertCorsFor(r, PREVIEW_123);
  assertEquals((await r.json()).error, 'PROVIDER_NOT_READY');
  assertEquals(calls.includes('crm_claim_fiscal_issuance'), false);
});
