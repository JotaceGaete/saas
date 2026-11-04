// Lista de empresas autorizadas (lib/allowlist.mjs): id interno + RUT, falla cerrado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAllowedIssuers, allowlistFromEnv, normalizeRut, EMPTY_ALLOWLIST, isAllowlist } from '../../lib/allowlist.mjs';
import { normalizeRut as apiNormalizeRut } from '../../../../../api/_lib/fiscal-connection.js';

const B1 = 'b72b5a55-8ce6-4d1b-99b1-0a3a618f0930';
const B2 = '1cb7e06b-a326-4f1a-a6bb-785d03c85133';
const B3 = '03fdfe77-713e-4dbb-977a-e38cfb4ebee2';
const R1 = '76123456-0';
const R2 = '77654321-7';
const R3 = '78111222-4';
const THREE = `${B1}=${R1},${B2}=${R2},${B3}=${R3}`;

test('las tres empresas: cada negocio solo con su propio RUT', () => {
  const a = parseAllowedIssuers(THREE);
  assert.equal(a.error, null);
  assert.equal(a.size, 3);
  assert.equal(a.permits(B1, R1), true);
  assert.equal(a.permits(B2, R2), true);
  assert.equal(a.permits(B3, R3), true);
  // RUT de otra empresa de la lista: no
  assert.equal(a.permits(B1, R2), false);
  assert.equal(a.permits(B3, R1), false);
  assert.equal(a.permitsBusiness(B2), true);
});

test('un negocio fuera de la lista no está autorizado, aunque use un RUT de la lista', () => {
  const a = parseAllowedIssuers(THREE);
  const intruso = '9b2f3c1e-5d4a-4b6c-8e7f-0a1b2c3d4e5f';
  assert.equal(a.permits(intruso, R1), false);
  assert.equal(a.permitsBusiness(intruso), false);
});

test('nunca por nombre: solo UUID y RUT; nombres o textos libres no autorizan', () => {
  const a = parseAllowedIssuers(THREE);
  assert.equal(a.permits('Mi Empresa SpA', R1), false);
  assert.equal(a.permits(B1, 'Mi Empresa SpA'), false);
  assert.equal(parseAllowedIssuers(`MiEmpresaSpA=${R1}`).error, 'ALLOWLIST_BUSINESS_ID');
  assert.equal(parseAllowedIssuers(`Mi Empresa SpA=${R1}`).error, 'ALLOWLIST_FORMAT');
  assert.equal(parseAllowedIssuers(`${B1}=MiEmpresa`).error, 'ALLOWLIST_RUT');
});

test('RUT con puntos, minúsculas y UUID en mayúsculas se comparan en forma canónica', () => {
  const a = parseAllowedIssuers(`${B1.toUpperCase()}=76.123.456-0`);
  assert.equal(a.error, null);
  assert.equal(a.permits(B1, '76123456-0'), true);
  assert.equal(a.permits(B1.toUpperCase(), '76.123.456-0'), true);
  assert.equal(parseAllowedIssuers(`${B1}=11.111.111-k`).error, 'ALLOWLIST_RUT'); // dígito verificador incorrecto
});

test('falla cerrado: vacía, mal formada, dígito verificador inválido, duplicados o demasiado larga -> nadie', () => {
  for (const [raw, code] of [
    [undefined, 'ALLOWLIST_EMPTY'],
    ['', 'ALLOWLIST_EMPTY'],
    ['   ', 'ALLOWLIST_EMPTY'],
    [`${B1}`, 'ALLOWLIST_FORMAT'],
    [`${B1}=76123456-7`, 'ALLOWLIST_RUT'],
    [`${B1}=${R1},${B1}=${R2}`, 'ALLOWLIST_DUPLICATE'],
    [`${B1}=${R1},${B2}=${R1}`, 'ALLOWLIST_DUPLICATE'],
    [`${THREE},${B1}=${R1}`, 'ALLOWLIST_DUPLICATE'],
    [Array.from({ length: 11 }, () => `${B1}=${R1}`).join(','), 'ALLOWLIST_TOO_LONG'],
  ]) {
    const a = parseAllowedIssuers(raw);
    assert.equal(a.error, code, String(raw));
    assert.equal(a.size, 0);
    assert.equal(a.permits(B1, R1), false);
    assert.equal(a.permitsBusiness(B1), false);
  }
  // Una entrada mala invalida TODA la lista (no se aceptan las demás a medias).
  const partial = parseAllowedIssuers(`${B1}=${R1},${B2}=00000000-1`);
  assert.equal(partial.permits(B1, R1), false);
});

test('el mensaje de error no repite el contenido de la variable', () => {
  const a = parseAllowedIssuers(`${B1}=76123456-7`);
  assert.doesNotMatch(String(a.error), /76123456|b72b5a55/);
});

test('desde el entorno y valores no válidos', () => {
  assert.equal(allowlistFromEnv({ FISCAL_ALLOWED_ISSUERS: `${B1}=${R1}` }).permits(B1, R1), true);
  assert.equal(allowlistFromEnv({}).size, 0);
  assert.equal(EMPTY_ALLOWLIST.permits(B1, R1), false);
  assert.equal(isAllowlist(EMPTY_ALLOWLIST), true);
  assert.equal(isAllowlist(null), false);
  assert.equal(isAllowlist({ permits: () => true }), false);
  const a = parseAllowedIssuers(THREE);
  assert.equal(a.permits(null, R1), false);
  assert.equal(a.permits(B1, null), false);
  assert.equal(a.permits(B1, 76123456), false);
  assert.equal(Object.isFrozen(a), true);
});

test('misma normalización de RUT que la API de conexión', () => {
  for (const r of ['76123456-0', '76.123.456-0', '11111111-1', '11.111.111-K', '1-9', '0-0', '7-k', 'x', '', '123456789-0']) {
    assert.equal(normalizeRut(r), apiNormalizeRut(r), r);
  }
});
