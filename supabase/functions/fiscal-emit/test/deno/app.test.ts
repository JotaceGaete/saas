// Pruebas del cableado en Deno (runtime de Supabase Edge Functions). Cliente de base falso con la forma
// de supabase-js; el almacén contra PostgREST real NO se prueba aquí.
import { strictEqual as assertEquals } from 'node:assert';
import { buildFiscalHandler, type FiscalDbClient } from '../../app.ts';
import { createDtecoreBlockedProvider } from '../../lib/providers/dtecore-blocked.mjs';

const USER = 'user-a';
// 32 bytes en base64 (solo para pruebas; nunca una clave real).
const TEST_KEY = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=';
const BIZ = '11111111-1111-4111-8111-111111111111';
const SALE = '22222222-2222-4222-8222-222222222222';

function fakeDb(calls: Array<{ fn: string; args: any }>): FiscalDbClient {
  return {
    auth: {
      getUser: async (token: string) => ({ data: { user: token === 'good' ? { id: USER } : null }, error: null }),
    },
    rpc: async (fn: string, args: any) => {
      calls.push({ fn, args });
      return { data: null, error: null };
    },
    from: (_table: string) => {
      const q: any = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return q;
    },
  };
}

const req = (body: unknown, token = 'good', method = 'POST') =>
  new Request('https://x.test/fiscal-emit', {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });

Deno.test('sin token válido -> 401 y no toca la base', async () => {
  const calls: any[] = [];
  const h = buildFiscalHandler({ db: fakeDb(calls), provider: createDtecoreBlockedProvider(), masterKey: TEST_KEY });
  const r = await h(req({ action: 'emit', saleId: SALE }, 'bad'));
  assertEquals(r.status, 401);
  assertEquals(calls.length, 0);
});

Deno.test('JSON inválido -> 400 BAD_REQUEST', async () => {
  const h = buildFiscalHandler({ db: fakeDb([]), provider: createDtecoreBlockedProvider(), masterKey: TEST_KEY });
  const r = await h(new Request('https://x.test/', { method: 'POST', headers: { authorization: 'Bearer good' }, body: '{nope' }));
  assertEquals(r.status, 400);
  assertEquals((await r.json()).error, 'BAD_REQUEST');
});

Deno.test('campo no permitido (business_id) -> 400, sin llamadas', async () => {
  const calls: any[] = [];
  const h = buildFiscalHandler({ db: fakeDb(calls), provider: createDtecoreBlockedProvider(), masterKey: TEST_KEY });
  const r = await h(req({ action: 'emit', saleId: SALE, business_id: BIZ }));
  assertEquals(r.status, 400);
  assertEquals((await r.json()).error, 'UNKNOWN_FIELD');
  assertEquals(calls.length, 0);
});

Deno.test('venta no encontrada -> 404 SALE_NOT_FOUND, sin exponer existencia', async () => {
  const calls: any[] = [];
  const h = buildFiscalHandler({ db: fakeDb(calls), provider: createDtecoreBlockedProvider(), masterKey: TEST_KEY });
  const r = await h(req({ action: 'emit', saleId: SALE }));
  assertEquals(r.status, 404);
  assertEquals((await r.json()).error, 'SALE_NOT_FOUND');
  assertEquals(calls.length, 0);
});

Deno.test('cabeceras de respuesta: no-store y JSON', async () => {
  const h = buildFiscalHandler({ db: fakeDb([]), provider: createDtecoreBlockedProvider(), masterKey: TEST_KEY });
  const r = await h(req({ action: 'emit', saleId: SALE }));
  assertEquals(r.headers.get('cache-control'), 'no-store');
  assertEquals(r.headers.get('content-type'), 'application/json');
});

Deno.test('venta propia con proveedor bloqueado -> 503 PROVIDER_NOT_READY, sin reclamo ni llamada al proveedor', async () => {
  const calls: Array<{ fn: string; args: any }> = [];
  const db: FiscalDbClient = {
    auth: { getUser: async () => ({ data: { user: { id: USER } }, error: null }) },
    rpc: async (fn: string, args: any) => {
      calls.push({ fn, args });
      return { data: null, error: null }; // sin fila de ledger
    },
    from: (table: string) => {
      const rows: Record<string, any> = {
        crm_invoices: { id: SALE, business_id: BIZ, status: 'pagada', paid_at: '2026-10-31T12:00:00Z', total: 2380, discount_amount: 0 },
        wa_businesses: { id: BIZ, user_id: USER, country_code: 'CL' },
      };
      const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: rows[table] ?? null, error: null }) };
      return q;
    },
  };
  const h = buildFiscalHandler({ db, provider: createDtecoreBlockedProvider(), masterKey: TEST_KEY });
  const r = await h(req({ action: 'emit', saleId: SALE }));
  assertEquals(r.status, 503);
  assertEquals((await r.json()).error, 'PROVIDER_NOT_READY');
  assertEquals(calls.some((c) => c.fn === 'crm_claim_fiscal_issuance'), false);
});
