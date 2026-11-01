// node:test (sin vitest): `node --test src/lib/printing/providers/localConnectorProvider.test.js`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ConnectorError,
  assertLoopbackBaseUrl,
  bytesToBase64,
  createLocalConnectorProvider,
} from './localConnectorProvider.js';

function fakeFetch(handler) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, init });
    const result = handler(url, init);
    if (result instanceof Error) throw result;
    const { status = 200, body = {} } = result;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  };
  return { fn, calls };
}

test('rechaza URLs que no son loopback', () => {
  assert.throws(() => assertLoopbackBaseUrl('http://192.168.1.20:47801'), ConnectorError);
  assert.throws(() => assertLoopbackBaseUrl('https://evil.example'), ConnectorError);
  assert.throws(() => assertLoopbackBaseUrl('ftp://127.0.0.1'), ConnectorError);
  assert.throws(() => assertLoopbackBaseUrl('no es una url'), ConnectorError);
  assert.equal(assertLoopbackBaseUrl('http://127.0.0.1:47801/'), 'http://127.0.0.1:47801');
  assert.equal(assertLoopbackBaseUrl('http://localhost:47801'), 'http://localhost:47801');
});

test('connect valida el servicio y marca el provider como disponible', async () => {
  const { fn, calls } = fakeFetch(() => ({
    body: { service: 'walinka-print-connector', apiVersion: 1, version: '0.2.0' },
  }));
  const provider = createLocalConnectorProvider({ fetchImpl: fn });
  assert.equal(provider.isAvailable(), false);
  await provider.connect();
  assert.equal(provider.isAvailable(), true);
  assert.equal(calls[0].url, 'http://127.0.0.1:47801/v1/health');
});

test('connect rechaza otro servicio en el mismo puerto', async () => {
  const { fn } = fakeFetch(() => ({ body: { service: 'otro' } }));
  const provider = createLocalConnectorProvider({ fetchImpl: fn });
  await assert.rejects(provider.connect(), (e) => e.code === 'connector_incompatible');
});

test('red caída se traduce a connector_unreachable con mensaje claro', async () => {
  const { fn } = fakeFetch(() => new TypeError('Failed to fetch'));
  const provider = createLocalConnectorProvider({ fetchImpl: fn });
  await assert.rejects(provider.connect(), (e) => {
    assert.equal(e.code, 'connector_unreachable');
    assert.match(e.message, /conector/);
    return true;
  });
});

test('print envía Bearer, clave de idempotencia y bytes en base64', async () => {
  const { fn, calls } = fakeFetch(() => ({ body: { status: 'sent_to_spooler', duplicate: false } }));
  const provider = createLocalConnectorProvider({ token: 'tok123', fetchImpl: fn });
  const bytes = new Uint8Array([0x1b, 0x40, 0x1d, 0x56, 0x42, 0x00]);
  const result = await provider.print('Star TSP143', bytes, { idempotencyKey: 'sale:42:ticket' });

  assert.deepEqual(result, { status: 'sent_to_spooler', duplicate: false });
  const call = calls[0];
  assert.equal(call.url, 'http://127.0.0.1:47801/v1/print');
  assert.equal(call.init.headers.Authorization, 'Bearer tok123');
  const payload = JSON.parse(call.init.body);
  assert.equal(payload.idempotencyKey, 'sale:42:ticket');
  assert.equal(payload.printerName, 'Star TSP143');
  assert.equal(payload.copies, 1);
  assert.equal(payload.dataBase64, bytesToBase64(bytes));
  assert.equal(Buffer.from(payload.dataBase64, 'base64').toString('hex'), '1b401d564200');
});

test('print sin clave de idempotencia se rechaza antes de llamar al conector', async () => {
  const { fn, calls } = fakeFetch(() => ({ body: {} }));
  const provider = createLocalConnectorProvider({ token: 't', fetchImpl: fn });
  await assert.rejects(provider.print('X', new Uint8Array([1]), {}), (e) => e.code === 'missing_idempotency_key');
  assert.equal(calls.length, 0);
});

test('duplicado no es error: el conector responde duplicate=true', async () => {
  const { fn } = fakeFetch(() => ({ body: { status: 'sent_to_spooler', duplicate: true } }));
  const provider = createLocalConnectorProvider({ token: 't', fetchImpl: fn });
  const result = await provider.print('X', new Uint8Array([1]), { idempotencyKey: 'sale:1:ticket' });
  assert.equal(result.duplicate, true);
});

test('impresora no lista expone los problemas en el error', async () => {
  const { fn } = fakeFetch(() => ({
    status: 409,
    body: { error: 'printer_unavailable', problems: ['Sin papel'] },
  }));
  const provider = createLocalConnectorProvider({ token: 't', fetchImpl: fn });
  await assert.rejects(provider.print('X', new Uint8Array([1]), { idempotencyKey: 'sale:1:ticket' }), (e) => {
    assert.equal(e.code, 'printer_unavailable');
    assert.deepEqual(e.problems, ['Sin papel']);
    assert.match(e.message, /Sin papel/);
    return true;
  });
});

test('sin token no se intenta ninguna llamada autenticada', async () => {
  const { fn, calls } = fakeFetch(() => ({ body: {} }));
  const provider = createLocalConnectorProvider({ fetchImpl: fn });
  await assert.rejects(provider.listPrinters(), (e) => e.code === 'not_paired');
  assert.equal(calls.length, 0);
});

test('listPrinters devuelve solo los nombres', async () => {
  const { fn } = fakeFetch(() => ({
    body: { printers: [{ name: 'Star TSP143', isDefault: true, problems: [] }, { name: 'PDF' }] },
  }));
  const provider = createLocalConnectorProvider({ token: 't', fetchImpl: fn });
  assert.deepEqual(await provider.listPrinters(), ['Star TSP143', 'PDF']);
});

test('401 del conector indica que hay que volver a emparejar', async () => {
  const { fn } = fakeFetch(() => ({ status: 401, body: { error: 'unauthorized' } }));
  const provider = createLocalConnectorProvider({ token: 'viejo', fetchImpl: fn });
  await assert.rejects(provider.listPrinters(), (e) => {
    assert.equal(e.status, 401);
    assert.match(e.message, /emparejar/);
    return true;
  });
});

test('pair devuelve el token entregado por el conector', async () => {
  const { fn, calls } = fakeFetch(() => ({ body: { token: 'abc' } }));
  const provider = createLocalConnectorProvider({ fetchImpl: fn });
  assert.equal(await provider.pair('123456', 'Caja 1'), 'abc');
  assert.equal(calls[0].url, 'http://127.0.0.1:47801/v1/pair');
  assert.deepEqual(JSON.parse(calls[0].init.body), { code: '123456', deviceName: 'Caja 1' });
});
