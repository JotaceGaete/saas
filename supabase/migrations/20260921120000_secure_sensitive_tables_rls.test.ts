/**
 * 20260921120000_secure_sensitive_tables_rls.sql — tests estáticos
 * (source-scan). Confirma que el DDL correcto existe en el archivo fuente
 * para las 4 tablas de SEGURIDAD-WALINKA-1C.
 *
 * La verificación real contra PostgreSQL (relrowsecurity, policies, ACL,
 * has_table_privilege para anon/authenticated/service_role antes y
 * después, y que los consumidores server-side reales -- signup trigger,
 * mp-webhook, enforce-expired-plans, webhook repositories -- siguen
 * funcionando) se documenta en el informe de SEGURIDAD-WALINKA-1C -- este
 * archivo solo prueba que el SQL versionado dice lo que se supone que
 * dice, mismo criterio que 20260921100000_fix_analytics_rpcs_cross_tenant.test.ts
 * y 20260921110000_fix_plan_admin_rpcs_authorization.test.ts.
 */
import { describe, it, expect } from 'vitest';
import migrationSource from './20260921120000_secure_sensitive_tables_rls.sql?raw';

const TABLES = [
  'billing_subscriptions',
  'billing_webhook_events',
  'paypal_webhook_events',
  'wa_lifecycle_events',
];

// Código sin comentarios `--` -- evita falsos positivos con las frases que
// el propio DDL usa en su prosa explicativa (ej. "salvo FORCE ROW LEVEL
// SECURITY, que esta migración NO activa a propósito").
const codeOnly = migrationSource.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');

describe('SEGURIDAD-WALINKA-1C — RLS + revoke en tablas sensibles', () => {
  it.each(TABLES)('%s: ENABLE ROW LEVEL SECURITY', (table) => {
    const re = new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY;`);
    expect(migrationSource).toMatch(re);
  });

  it.each(TABLES)('%s: REVOKE ALL FROM PUBLIC, anon, authenticated (sin GRANT de vuelta a ningún rol cliente)', (table) => {
    const revokeRe = new RegExp(`REVOKE ALL ON public\\.${table} FROM PUBLIC, anon, authenticated;`);
    expect(migrationSource).toMatch(revokeRe);
    // No debe haber ningún GRANT posterior a anon/authenticated sobre esta tabla.
    const grantBackRe = new RegExp(`GRANT[^;]*ON public\\.${table}[^;]*TO[^;]*(anon|authenticated)`, 'i');
    expect(migrationSource).not.toMatch(grantBackRe);
  });

  it('no crea ninguna policy (todo el acceso legítimo es service_role o SECURITY DEFINER owner)', () => {
    expect(codeOnly).not.toMatch(/CREATE POLICY/i);
  });

  it('no activa FORCE ROW LEVEL SECURITY (romperia las funciones SECURITY DEFINER owned by postgres)', () => {
    expect(codeOnly).not.toMatch(/FORCE ROW LEVEL SECURITY/i);
  });

  it('también revoca la vista wa_lifecycle_events_pending (si no, anon/authenticated podrían leer la cola vía la vista)', () => {
    expect(codeOnly).toMatch(/REVOKE ALL ON public\.wa_lifecycle_events_pending FROM PUBLIC, anon, authenticated;/);
  });

  it('no toca ninguna otra tabla, función ni policy fuera de las 4 tablas (+ su vista)', () => {
    expect(codeOnly).not.toMatch(/CREATE TABLE|DROP TABLE|CREATE OR REPLACE FUNCTION|DROP FUNCTION/i);
    const alterMatches = codeOnly.match(/ALTER TABLE public\.(\w+)/g) || [];
    const alteredTables = new Set(alterMatches.map((m) => m.replace('ALTER TABLE public.', '')));
    expect(alteredTables).toEqual(new Set(TABLES));

    const revokeMatches = codeOnly.match(/REVOKE ALL ON public\.(\w+)/g) || [];
    const revokedRelations = new Set(revokeMatches.map((m) => m.replace('REVOKE ALL ON public.', '')));
    expect(revokedRelations).toEqual(new Set([...TABLES, 'wa_lifecycle_events_pending']));
  });

  it('idempotente: ENABLE ROW LEVEL SECURITY y REVOKE ALL son operaciones idempotentes por naturaleza (repetirlas deja el mismo estado final)', () => {
    expect(codeOnly.match(/ENABLE ROW LEVEL SECURITY/g)?.length).toBe(4);
    expect(codeOnly.match(/REVOKE ALL ON public\./g)?.length).toBe(5);
  });
});
