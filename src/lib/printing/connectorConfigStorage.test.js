// node:test: `node --test src/lib/printing/connectorConfigStorage.test.js`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildConnectorConfigKey,
  defaultConnectorConfig,
  readConnectorConfig,
  writeConnectorConfig,
} from './connectorConfigStorage.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    data,
  };
}

const TOKEN = 'x'.repeat(43);

test('clave por negocio y null sin negocio', () => {
  assert.equal(buildConnectorConfigKey(7), 'walinka:print-connector:7');
  assert.equal(buildConnectorConfigKey(''), null);
});

test('sin configuración se devuelven los valores por defecto (desactivado)', () => {
  const storage = memoryStorage();
  assert.deepEqual(readConnectorConfig('k', storage), defaultConnectorConfig());
  assert.equal(readConnectorConfig('k', storage).enabled, false);
});

test('JSON corrupto o storage ausente no rompe la lectura', () => {
  assert.equal(readConnectorConfig('k', memoryStorage({ k: '{no json' })).enabled, false);
  assert.equal(readConnectorConfig('k', null).enabled, false);
});

test('una URL no loopback guardada a mano se descarta', () => {
  const storage = memoryStorage({
    k: JSON.stringify({ enabled: true, baseUrl: 'http://10.0.0.5:47801', token: TOKEN, printerName: 'P' }),
  });
  const config = readConnectorConfig('k', storage);
  assert.equal(config.baseUrl, 'http://127.0.0.1:47801');
});

test('un token demasiado corto se descarta', () => {
  const storage = memoryStorage({ k: JSON.stringify({ enabled: true, token: 'corto' }) });
  assert.equal(readConnectorConfig('k', storage).token, null);
});

test('escribir y leer conserva la configuración saneada', () => {
  const storage = memoryStorage();
  writeConnectorConfig('k', { enabled: true, token: TOKEN, printerName: 'Star TSP143', deviceName: 'Caja 1' }, storage);
  const config = readConnectorConfig('k', storage);
  assert.equal(config.enabled, true);
  assert.equal(config.printerName, 'Star TSP143');
  assert.equal(config.token, TOKEN);
});

test('activo sin token se corrige a desactivado', () => {
  const storage = memoryStorage({ k: JSON.stringify({ enabled: true, token: null }) });
  assert.equal(readConnectorConfig('k', storage).enabled, false);
});
