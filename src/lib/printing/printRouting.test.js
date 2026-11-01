// node:test: `node --test src/lib/printing/printRouting.test.js`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROUTE, PRINT_ERROR, buildPrintKey, buildPrintTarget, connectorStatusView, resolvePrintRoute,
} from './printRouting.js';

const TOKEN = 'a'.repeat(43);
const active = { enabled: true, token: TOKEN, baseUrl: 'http://127.0.0.1:47801', printerName: 'XP-80C' };
const KEY_PATTERN = /^[A-Za-z0-9:_\-]{8,128}$/;

test('ruta: conector solo si está activo Y emparejado; si no, QZ', () => {
  assert.equal(resolvePrintRoute(active), ROUTE.CONNECTOR);
  assert.equal(resolvePrintRoute({ ...active, enabled: false }), ROUTE.QZ);
  assert.equal(resolvePrintRoute({ ...active, token: null }), ROUTE.QZ);
  assert.equal(resolvePrintRoute(undefined), ROUTE.QZ);
});

test('con conector activo, el destino es el conector y nunca QZ', () => {
  const target = buildPrintTarget({ connectorConfig: active, qzPrinterName: 'QZ-Printer', idempotencyKey: 'sale:1:ticket' });
  assert.equal(target.route, ROUTE.CONNECTOR);
  assert.equal(target.printerName, 'XP-80C');
  assert.equal(target.error, null);
  assert.equal(typeof target.connector.print, 'function');
});

test('conector activo sin impresora elegida: error, no cae a QZ', () => {
  const target = buildPrintTarget({ connectorConfig: { ...active, printerName: null }, qzPrinterName: 'QZ-Printer' });
  assert.equal(target.error, PRINT_ERROR.MISSING_PRINTER);
  assert.equal(target.printerName, null);
  assert.equal(target.connector, undefined);
});

test('sin conector: destino QZ con la impresora de QZ', () => {
  const target = buildPrintTarget({ connectorConfig: { ...active, enabled: false }, qzPrinterName: 'QZ-Printer' });
  assert.deepEqual(
    { route: target.route, printerName: target.printerName, error: target.error },
    { route: ROUTE.QZ, printerName: 'QZ-Printer', error: null },
  );
  assert.equal(target.connector, undefined);
});

test('sin conector y sin impresora QZ: error de impresora faltante', () => {
  const target = buildPrintTarget({ connectorConfig: null, qzPrinterName: null });
  assert.equal(target.error, PRINT_ERROR.MISSING_PRINTER);
});

test('venta automática: clave determinística sale:<id>:ticket', () => {
  assert.equal(buildPrintKey('ticket', 42), 'sale:42:ticket');
  assert.equal(buildPrintKey('ticket', 42), buildPrintKey('ticket', 42));
});

test('acciones explícitas: clave única por intento, válida para el conector', () => {
  const a = buildPrintKey('test', 7, { now: 1000, nonce: 'aaa' });
  const b = buildPrintKey('test', 7, { now: 1000, nonce: 'bbb' });
  assert.notEqual(a, b);
  for (const key of [a, b, buildPrintKey('logo', 'biz'), buildPrintKey('cut', 'biz')]) {
    assert.match(key, KEY_PATTERN);
  }
});

test('estado: sin conector activo no muestra "conectado" del conector', () => {
  const view = connectorStatusView({ active: false, paired: false, health: 'ok', printerName: null });
  assert.equal(view.label, 'Conector detectado · sin emparejar');
  assert.equal(view.canPrint, false);
});

test('estado: activo y conectado con impresora permite imprimir', () => {
  const view = connectorStatusView({ active: true, paired: true, health: 'ok', printerName: 'XP-80C' });
  assert.equal(view.label, 'Conectado');
  assert.equal(view.tone, 'ok');
  assert.equal(view.canPrint, true);
});

test('estado: activo sin impresora pide elegir una; conector caído no imprime', () => {
  assert.equal(connectorStatusView({ active: true, paired: true, health: 'ok', printerName: null }).canPrint, false);
  const down = connectorStatusView({ active: true, paired: true, health: 'unreachable', printerName: 'XP-80C' });
  assert.equal(down.label, 'Conector no encontrado');
  assert.equal(down.canPrint, false);
});

test('REGRESIÓN: health 200 con listado fallido no muestra "Conector no encontrado"', () => {
  const view = connectorStatusView({ active: true, paired: true, health: 'ok', printerName: 'XP-80C', printersError: 'El conector respondió, pero no pudo listar las impresoras.' });
  assert.equal(view.label, 'Conector sin lista de impresoras');
  assert.equal(view.canPrint, false);
  const ok = connectorStatusView({ active: true, paired: true, health: 'ok', printerName: 'XP-80C', printersError: null });
  assert.equal(ok.label, 'Conectado');
});
