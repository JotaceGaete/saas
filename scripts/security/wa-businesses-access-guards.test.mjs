// Guardas estáticas de acceso a wa_businesses. Se ejecutan sin base de datos.
// Garantizan que nadie reintroduzca lecturas directas de email o plan desde el cliente,
// y que la migración mantenga las restricciones probadas en wa-businesses-access-tests.sql.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const MIGRATION = read('supabase/migrations/20261031120000_wa_businesses_access_hardening.sql');
const SENSITIVE = ['email', 'plan_slug', 'plan_started_at', 'plan_expires_at', 'trial_expires_at',
  'scheduled_plan_slug', 'scheduled_change_at', 'activated_at'];

function walk(dir, out = []) {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, name);
    const st = statSync(join(ROOT, rel));
    if (st.isDirectory()) { if (!['node_modules', 'dist', '.git'].includes(name)) walk(rel, out); }
    else if (/\.(js|jsx|mjs|ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(rel);
  }
  return out;
}

test('migración: elimina la lectura pública abierta de wa_businesses', () => {
  assert.match(MIGRATION, /DROP POLICY IF EXISTS wa_businesses_public_read ON public\.wa_businesses/);
  assert.match(MIGRATION, /REVOKE SELECT ON public\.wa_businesses FROM anon, authenticated/);
});

test('migración: lista de columnas públicas no incluye email ni datos de suscripción', () => {
  const grant = MIGRATION.match(/GRANT SELECT \(([\s\S]*?)\) ON public\.wa_businesses TO anon, authenticated/);
  assert.ok(grant, 'falta GRANT SELECT por columnas');
  const cols = grant[1].split(',').map((c) => c.trim());
  for (const col of SENSITIVE) assert.ok(!cols.includes(col), `columna sensible expuesta: ${col}`);
});

test('migración: guardia de billing cubre plan, trial, is_active y user_id en UPDATE', () => {
  for (const col of ['user_id', 'plan_slug', 'plan_expires_at', 'trial_expires_at', 'is_active', 'scheduled_plan_slug']) {
    assert.match(MIGRATION, new RegExp(`NEW\\.${col} IS DISTINCT FROM OLD\\.${col}`), `sin guardia para ${col}`);
  }
  assert.match(MIGRATION, /CREATE TRIGGER wa_businesses_guard_billing/);
});

test('migración: anon no puede escribir en wa_businesses ni wa_payments', () => {
  assert.match(MIGRATION, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public\.wa_businesses FROM anon/);
  assert.match(MIGRATION, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public\.wa_payments FROM anon, authenticated/);
});

test('cliente: la lista pública del catálogo no incluye email ni datos de suscripción', () => {
  const src = read('src/services/businessBillingService.js');
  const block = src.match(/BUSINESS_PUBLIC_COLUMNS = \[([\s\S]*?)\]\.join/);
  assert.ok(block, 'no se encontró BUSINESS_PUBLIC_COLUMNS');
  for (const col of SENSITIVE) assert.ok(!block[1].includes(`'${col}'`), `lista pública incluye ${col}`);
});

test('cliente: ningún archivo consulta wa_businesses con select("*") ni con columnas sensibles', () => {
  const offenders = [];
  for (const file of walk('src').concat(walk('api'))) {
    const lines = readFileSync(join(ROOT, file), 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!/from\(\s*['"]wa_businesses['"]\s*\)/.test(line)) return;
      // Ventana: el select/eq de la misma cadena (hasta 6 líneas siguientes).
      const chain = lines.slice(i, i + 7).join('\n').split(/;\s*$|\)\s*;/m)[0];
      const sel = chain.match(/select\(\s*(['"`])([\s\S]*?)\1\s*\)/);
      if (!sel) return;
      const cols = sel[2].trim();
      if (cols === '*' || SENSITIVE.some((c) => new RegExp(`\\b${c}\\b`).test(cols))) {
        offenders.push(`${relative(ROOT, join(ROOT, file))}:${i + 1} -> select(${cols.slice(0, 60)})`);
      }
    });
  }
  // Las escrituras con .select(BUSINESS_PUBLIC_COLUMNS) son válidas (no contienen nombres literales).
  assert.deepEqual(offenders, [], `lecturas de columnas privadas desde cliente:\n${offenders.join('\n')}`);
});

test('cliente: la facturación se obtiene solo por RPC', () => {
  const src = read('src/services/businessBillingService.js');
  assert.match(src, /rpc\('wa_get_business_billing'/);
  assert.match(src, /rpc\('wa_admin_list_business_billing'\)/);
  assert.match(src, /rpc\('wa_get_business_effective_plan'/);
});
