/**
 * 20260917100000_crm_invoices_issue_date_index.sql — tests estáticos
 * (source-scan). Mismo criterio que el resto de las migraciones de este
 * repo (`npx vitest run` no tiene Postgres disponible en este sandbox): esta
 * suite prueba que el DDL correcto existe en el código fuente, e-idempotente
 * y acotado exactamente al índice que REPORTES-PERIODO-1 necesita.
 *
 * NO se corrió contra un Postgres real en este entorno (mismo bloqueo de
 * egress a registries Docker documentado en las migraciones previas de
 * CAJA-CIERRE-CONCILIACION-1 y CAJA-COSTOS-1) -- requiere validación local
 * con `supabase db reset` / `supabase migration up` antes de aplicarse a
 * cualquier entorno real. Nunca se corrió `supabase db push` contra
 * producción.
 */
import { describe, it, expect } from 'vitest';
import migrationSource from './20260917100000_crm_invoices_issue_date_index.sql?raw';

describe('REPORTES-PERIODO-1 — índice compuesto (business_id, issue_date) en crm_invoices', () => {
  it('crea el índice de forma idempotente (IF NOT EXISTS)', () => {
    expect(migrationSource).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_crm_invoices_business_issue_date\s*\n\s*ON public\.crm_invoices \(business_id, issue_date\);/,
    );
  });

  it('no toca ninguna otra tabla', () => {
    const codeOnly = migrationSource.split('\n').map(l => l.replace(/--.*$/, '')).join('\n');
    expect(codeOnly).not.toMatch(/crm_payments|crm_cash_movements|crm_cash_sessions|crm_stock_movements/);
  });

  it('no crea tablas, funciones, policies ni grants -- únicamente el índice', () => {
    const codeOnly = migrationSource.split('\n').map(l => l.replace(/--.*$/, '')).join('\n');
    expect(codeOnly).not.toMatch(/CREATE TABLE/i);
    expect(codeOnly).not.toMatch(/CREATE (OR REPLACE )?FUNCTION/i);
    expect(codeOnly).not.toMatch(/CREATE POLICY|DROP POLICY|ALTER POLICY/i);
    expect(codeOnly).not.toMatch(/GRANT |REVOKE /i);
    expect(codeOnly).not.toMatch(/ROW LEVEL SECURITY/i);
    expect((codeOnly.match(/CREATE (UNIQUE )?INDEX/gi) || []).length).toBe(1);
  });
});
