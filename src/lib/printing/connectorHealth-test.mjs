// node --test src/lib/printing/connectorHealth-test.mjs (nombre -test.mjs: lo recoge node, no Vitest)
// Regresión: con /v1/health en 200 la UI no debe decir "conector no encontrado"
// por un fallo al listar impresoras.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkConnector, describeVerify } from './connectorHealth.js';

function provider({ connect, listPrinters }) {
  return {
    connect: connect ?? (async () => ({ service: 'walinka-print-connector' })),
    listPrinters: listPrinters ?? (async () => ['XP-80C']),
  };
}

const networkError = () => Object.assign(new Error('No se encontró el conector de impresión en este equipo. Revisa que esté abierto.'), { code: 'connector_unreachable' });

test('health falla: conector no encontrado, sin llamar a impresoras', async () => {
  let listed = false;
  const state = await checkConnector({
    provider: provider({
      connect: async () => { throw networkError(); },
      listPrinters: async () => { listed = true; return []; },
    }),
    hasToken: true,
  });
  assert.equal(state.health, 'unreachable');
  assert.match(state.healthError, /No se encontró el conector/);
  assert.equal(listed, false);
});

test('health 200 sin token: ok, sin impresoras y sin consultar el listado', async () => {
  let listed = false;
  const state = await checkConnector({
    provider: provider({ listPrinters: async () => { listed = true; return []; } }),
    hasToken: false,
  });
  assert.deepEqual(state, { health: 'ok', healthError: null, version: null, printers: [], printersError: null });
  assert.equal(listed, false);
});

test('health 200 y listado con token: devuelve impresoras', async () => {
  const state = await checkConnector({ provider: provider({}), hasToken: true });
  assert.equal(state.health, 'ok');
  assert.deepEqual(state.printers, ['XP-80C']);
  assert.equal(state.printersError, null);
});

test('REGRESIÓN: health 200 pero listado falla por red -> sigue ok, error de listado (no "no encontrado")', async () => {
  const state = await checkConnector({
    provider: provider({ listPrinters: async () => { throw networkError(); } }),
    hasToken: true,
  });
  assert.equal(state.health, 'ok');
  assert.equal(state.healthError, null);
  assert.match(state.printersError, /respondió, pero no pudo listar/);
  assert.doesNotMatch(state.printersError, /No se encontró/);
});

test('listado 401 (token ya no válido): ok con el mensaje de emparejamiento', async () => {
  const state = await checkConnector({
    provider: provider({
      listPrinters: async () => { throw Object.assign(new Error('El equipo ya no está emparejado con el conector. Vuelve a emparejarlo.'), { code: 'unauthorized' }); },
    }),
    hasToken: true,
  });
  assert.equal(state.health, 'ok');
  assert.match(state.printersError, /ya no está emparejado/);
});

test('describeVerify: feedback visible para cada caso', () => {
  assert.deepEqual(describeVerify({ health: 'unreachable', healthError: 'No se encontró el conector', version: null, printers: [], printersError: null }, false),
    { ok: false, message: 'No se encontró el conector' });
  assert.equal(describeVerify({ health: 'ok', version: '0.3.0', printers: [], printersError: null }, false).message,
    'Conector 0.3.0 respondió correctamente. Falta emparejar este equipo.');
  assert.equal(describeVerify({ health: 'ok', version: '0.3.0', printers: ['A', 'B'], printersError: null }, true).message,
    'Conector 0.3.0 respondió correctamente. 2 impresoras disponibles.');
  const err = describeVerify({ health: 'ok', version: '0.3.0', printers: [], printersError: 'El conector respondió, pero no pudo listar las impresoras.' }, true);
  assert.equal(err.ok, false);
  assert.match(err.message, /^El conector respondió, pero no pudo listar las impresoras/);
});

test('Preview no autorizada: el conector escucha pero no autoriza el origen', async () => {
  const origin = 'https://saas-git-rama-juan-s-projects-afd7e18e.vercel.app';
  const state = await checkConnector({
    provider: { ...provider({ connect: async () => { throw networkError(); } }), probeListening: async () => true },
    hasToken: false,
    pageOrigin: origin,
  });
  assert.equal(state.health, 'unreachable');
  assert.equal(state.originBlocked, true);
  assert.ok(state.healthError.includes(origin));
  assert.match(state.healthError, /AllowedOrigins/);
});

test('Preview y conector cerrado: lo dice y nombra el origen y el permiso de red local', async () => {
  const origin = 'https://saas-git-rama-juan-s-projects-afd7e18e.vercel.app';
  const state = await checkConnector({
    provider: { ...provider({ connect: async () => { throw networkError(); } }), probeListening: async () => false },
    hasToken: false,
    pageOrigin: origin,
  });
  assert.equal(state.originBlocked, false);
  assert.match(state.healthError, /No se encontró el conector/);
  assert.match(state.healthError, /red local/);
});

test('producción: sin sonda y con el mensaje de siempre', async () => {
  let probed = false;
  const state = await checkConnector({
    provider: { ...provider({ connect: async () => { throw networkError(); } }), probeListening: async () => { probed = true; return true; } },
    hasToken: false,
    pageOrigin: 'https://go.ventalink.app',
  });
  assert.equal(probed, false);
  assert.equal(state.healthError, 'No se encontró el conector de impresión en este equipo. Revisa que esté abierto.');
});
