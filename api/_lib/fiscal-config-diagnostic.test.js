// Diagnóstico temporal de configuración de /api/fiscal/connection: nunca expone valores y
// distingue exactamente por qué la API respondería SERVER_NOT_CONFIGURED.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { describeFiscalConnectionConfig as describe, isDiagnosticAllowed } from './fiscal-config-diagnostic.js';
import handler from '../fiscal/connection.js';

const KEY = randomBytes(32).toString('base64');
const SRK = 'service-role-test-value-xyz';
const URL_ = 'https://proj-test.supabase.co';
const PREVIEW = { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'claude/fiscal-multiempresa-integridad', VERCEL_GIT_COMMIT_SHA: 'abcdef1234567890' };
const base = { ...PREVIEW, SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: SRK };

test('configuración completa: sin causa de SERVER_NOT_CONFIGURED', () => {
  const d = describe({ ...base, FISCAL_MASTER_KEY: KEY });
  assert.deepEqual(d.fiscalMasterKey, { present: true, canonicalBase64: true, decodesTo32Bytes: true, acceptedByParseMasterKey: true });
  assert.equal(d.serverNotConfiguredBecause, null);
  assert.deepEqual(d.deployment, { vercelEnv: 'preview', gitBranch: 'claude/fiscal-multiempresa-integridad', gitCommit: 'abcdef1', isExpectedPreview: true });
});

test('cada causa posible se identifica', () => {
  const cases = [
    [{ ...PREVIEW, SUPABASE_SERVICE_ROLE_KEY: SRK, FISCAL_MASTER_KEY: KEY }, 'SUPABASE_ENV'],
    [{ ...PREVIEW, VITE_SUPABASE_URL: URL_, FISCAL_MASTER_KEY: KEY }, 'SUPABASE_ENV'],
    [{ ...base }, 'FISCAL_MASTER_KEY'],                                        // ausente
    [{ ...base, FISCAL_MASTER_KEY: '   ' }, 'FISCAL_MASTER_KEY'],               // en blanco
    [{ ...base, FISCAL_MASTER_KEY: randomBytes(32).toString('hex') }, 'FISCAL_MASTER_KEY'], // hex 64 = 48 bytes
    [{ ...base, FISCAL_MASTER_KEY: randomBytes(16).toString('base64') }, 'FISCAL_MASTER_KEY'], // 16 bytes
    [{ ...base, FISCAL_MASTER_KEY: KEY.slice(0, 30) }, 'FISCAL_MASTER_KEY'],    // truncada
  ];
  for (const [env, cause] of cases) assert.equal(describe(env).serverNotConfiguredBecause, cause);
  const hex = describe({ ...base, FISCAL_MASTER_KEY: randomBytes(32).toString('hex') }).fiscalMasterKey;
  assert.equal(hex.decodesTo32Bytes, false);
});

test('clave válida con espacios o comillas: la API la acepta, pero no es base64 canónico', () => {
  for (const v of [`${KEY}\n`, ` ${KEY} `, `"${KEY}"`]) {
    const k = describe({ ...base, FISCAL_MASTER_KEY: v }).fiscalMasterKey;
    assert.equal(k.canonicalBase64, false, JSON.stringify(v));
    assert.equal(k.acceptedByParseMasterKey, true, JSON.stringify(v));
  }
});

test('nunca incluye valores ni fragmentos de secretos', () => {
  const text = JSON.stringify(describe({ ...base, FISCAL_MASTER_KEY: KEY }));
  for (const secret of [KEY, KEY.slice(0, 8), KEY.slice(-8), SRK, URL_, 'proj-test']) assert.ok(!text.includes(secret), secret);
  assert.ok(!/"length"|bytes"\s*:\s*\d/.test(text));
});

test('solo se permite en la Preview de la rama de #123', () => {
  assert.equal(isDiagnosticAllowed(PREVIEW), true);
  assert.equal(isDiagnosticAllowed({ ...PREVIEW, VERCEL_ENV: 'production' }), false);
  assert.equal(isDiagnosticAllowed({ ...PREVIEW, VERCEL_GIT_COMMIT_REF: 'main' }), false);
  assert.equal(isDiagnosticAllowed({ ...PREVIEW, VERCEL_GIT_COMMIT_REF: 'otra-rama' }), false);
  assert.equal(isDiagnosticAllowed({}), false);
});

function fakeRes() {
  const r = { statusCode: 0, headers: {}, body: null };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}

test('handler: en la Preview correcta responde el diagnóstico sin tocar la base', async () => {
  const saved = { ...process.env };
  try {
    Object.assign(process.env, base, { FISCAL_MASTER_KEY: KEY });
    const res = fakeRes();
    await handler({ method: 'GET', url: '/api/fiscal/connection?diagnostic=config', query: { diagnostic: 'config' }, headers: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.serverNotConfiguredBecause, null);
    assert.equal(res.headers['cache-control'], 'no-store');
  } finally { process.env = saved; }
});

test('handler: fuera de la Preview (Production) el parámetro se ignora', async () => {
  const saved = { ...process.env };
  try {
    Object.assign(process.env, base, { VERCEL_ENV: 'production' });
    delete process.env.FISCAL_MASTER_KEY;
    const res = fakeRes();
    await handler({ method: 'GET', url: '/api/fiscal/connection?diagnostic=config', query: { diagnostic: 'config' }, headers: {} }, res);
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.body, { error: 'SERVER_NOT_CONFIGURED' });
  } finally { process.env = saved; }
});
