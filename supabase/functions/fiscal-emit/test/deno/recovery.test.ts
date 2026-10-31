import { strictEqual as assertEquals, throws as assertThrows } from 'node:assert';
import { buildRecoveryRunner, type FiscalDbClient } from '../../app.ts';

const db = { rpc() { return Promise.resolve({ data: null, error: null }); }, from() { throw new Error('not used'); }, auth: {} } as unknown as FiscalDbClient;

Deno.test('sin FISCAL_STALE_AFTER_MS -> 15 minutos por defecto', () => {
  const r = buildRecoveryRunner({ db, env: {} });
  assertEquals(r.staleAfterMs, 15 * 60_000);
  assertEquals(r.source, 'default');
});

Deno.test('FISCAL_STALE_AFTER_MS dentro de rango se respeta', () => {
  const r = buildRecoveryRunner({ db, env: { FISCAL_STALE_AFTER_MS: '1800000' } });
  assertEquals(r.staleAfterMs, 1_800_000);
  assertEquals(r.source, 'env');
});

Deno.test('FISCAL_STALE_AFTER_MS inválido -> el arranque falla, no hay ventana silenciosa', () => {
  assertThrows(() => buildRecoveryRunner({ db, env: { FISCAL_STALE_AFTER_MS: '60000' } }), /FISCAL_STALE_AFTER_MS/);
  assertThrows(() => buildRecoveryRunner({ db, env: { FISCAL_STALE_AFTER_MS: 'quince' } }), /FISCAL_STALE_AFTER_MS/);
});
