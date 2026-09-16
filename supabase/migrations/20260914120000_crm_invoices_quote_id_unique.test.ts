/**
 * 20260914120000_crm_invoices_quote_id_unique.sql — tests estáticos
 * (source-scan) de QUOTE-TO-SALE-1. Mismo criterio que el resto de las
 * migraciones de este repo (`npx vitest run` no tiene Postgres
 * disponible): esta suite prueba que el DDL correcto existe en el código
 * fuente, no que Postgres lo ejecuta.
 */
import { describe, it, expect } from 'vitest';
import migrationSource from './20260914120000_crm_invoices_quote_id_unique.sql?raw';

const codeOnly = migrationSource
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');

describe('QUOTE-TO-SALE-1 — crm_invoices_quote_id_uq', () => {
  it('crea un índice único llamado crm_invoices_quote_id_uq sobre crm_invoices(quote_id)', () => {
    expect(codeOnly).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS crm_invoices_quote_id_uq\s+ON public\.crm_invoices \(quote_id\)/);
  });

  it('es parcial (WHERE quote_id IS NOT NULL) -- no afecta notas de venta sin presupuesto de origen', () => {
    const indexMatch = codeOnly.match(/CREATE UNIQUE INDEX[\s\S]*?;/);
    expect(indexMatch).toBeTruthy();
    expect(indexMatch[0]).toMatch(/WHERE quote_id IS NOT NULL/);
  });

  it('no modifica ninguna fila existente (sin UPDATE/DELETE)', () => {
    expect(codeOnly).not.toMatch(/\bUPDATE\b/i);
    expect(codeOnly).not.toMatch(/\bDELETE\b/i);
  });

  it('no toca RLS ni políticas', () => {
    expect(codeOnly).not.toMatch(/CREATE POLICY|DROP POLICY|ALTER POLICY|ROW LEVEL SECURITY/i);
  });
});
