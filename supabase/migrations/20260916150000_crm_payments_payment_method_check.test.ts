/**
 * 20260916150000_crm_payments_payment_method_check.sql — tests estáticos
 * (source-scan) del hotfix TPV-PAYMENT-METHODS-2. Mismo criterio que el
 * resto de las migraciones de este repo (`npx vitest run` no tiene
 * Postgres disponible): esta suite prueba que el DDL correcto existe en
 * el código fuente. El comportamiento real contra la constraint vive en
 * supabase/diagnostics/verify_crm_payments_payment_method_check.sql.
 */
import { describe, it, expect } from 'vitest';
import migrationSource from './20260916150000_crm_payments_payment_method_check.sql?raw';

// El propio archivo discute en prosa (comentarios) varios de los conceptos
// que estas pruebas verifican que NO están en el DDL real (p. ej. "no toca
// crm_payments_amount_positive", "ninguna foreign key") -- se compara
// contra el código sin comentarios para no confundir la explicación con
// una sentencia SQL real.
const codeOnly = migrationSource
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');

describe('TPV-PAYMENT-METHODS-2 — DROP + ADD idempotente en ambos estados', () => {
  it('hace DROP CONSTRAINT IF EXISTS antes de recrearla (seguro si ya existe en producción o no existe en local)', () => {
    expect(migrationSource).toMatch(
      /ALTER TABLE public\.crm_payments\s*\n\s*DROP CONSTRAINT IF EXISTS crm_payments_payment_method_check;/,
    );
  });

  it('el DROP viene ANTES del ADD (mismo orden que crm_cash_movements_category_check en 20260809110000)', () => {
    const dropIdx = migrationSource.indexOf('DROP CONSTRAINT IF EXISTS crm_payments_payment_method_check');
    const addIdx = migrationSource.indexOf('ADD CONSTRAINT crm_payments_payment_method_check');
    expect(dropIdx).toBeGreaterThan(-1);
    expect(addIdx).toBeGreaterThan(-1);
    expect(dropIdx).toBeLessThan(addIdx);
  });
});

describe('TPV-PAYMENT-METHODS-2 — vocabulario exacto de la constraint', () => {
  const constraintMatch = migrationSource.match(
    /ADD CONSTRAINT crm_payments_payment_method_check\s*\n\s*CHECK \(payment_method = ANY \(ARRAY\[([\s\S]*?)\]\)\);/,
  );

  it('la constraint existe con el bloque ADD CONSTRAINT ... CHECK', () => {
    expect(constraintMatch).not.toBeNull();
  });

  const arrayBody = constraintMatch ? constraintMatch[1] : '';
  const values = [...arrayBody.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]);

  it('acepta exactamente los 8 valores requeridos, en cualquier orden, sin duplicados ni valores extra', () => {
    expect(values.sort()).toEqual(
      ['bank_transfer', 'card', 'cash', 'check', 'credit_card', 'debit_card', 'mercado_pago', 'other'].sort(),
    );
  });

  it("conserva 'card' (pagos históricos reales, nunca reclasificados)", () => {
    expect(values).toContain('card');
  });

  it("NO incluye 'credit' -- cuenta corriente, semántica distinta de credit_card, ningún flujo la inserta como payment_method", () => {
    expect(values).not.toContain('credit');
  });

  it("incluye 'debit_card', 'credit_card' y 'mercado_pago' (los 3 medios nuevos de PR #69/#70)", () => {
    expect(values).toContain('debit_card');
    expect(values).toContain('credit_card');
    expect(values).toContain('mercado_pago');
  });
});

describe('TPV-PAYMENT-METHODS-2 — no toca nada fuera de alcance', () => {
  it('no toca crm_payments_amount_positive ni crm_payments_payment_status_check', () => {
    expect(codeOnly).not.toMatch(/crm_payments_amount_positive/);
    expect(codeOnly).not.toMatch(/crm_payments_payment_status_check/);
  });

  it('no crea ni elimina ninguna otra tabla, función, índice, policy o grant', () => {
    expect(codeOnly).not.toMatch(/CREATE TABLE/i);
    expect(codeOnly).not.toMatch(/CREATE (OR REPLACE )?FUNCTION/i);
    expect(codeOnly).not.toMatch(/CREATE (UNIQUE )?INDEX/i);
    expect(codeOnly).not.toMatch(/CREATE POLICY|DROP POLICY|ALTER POLICY/i);
    expect(codeOnly).not.toMatch(/GRANT |REVOKE /i);
    expect(codeOnly).not.toMatch(/ROW LEVEL SECURITY/i);
  });

  it('no redefine crm_create_pos_sale ni ninguna otra RPC', () => {
    expect(codeOnly).not.toMatch(/CREATE OR REPLACE FUNCTION public\.crm_create_pos_sale/);
  });

  it('no hace ningún UPDATE -- no reclasifica pagos históricos', () => {
    expect(codeOnly).not.toMatch(/UPDATE\s+(public\.)?crm_payments/i);
  });

  it('no toca ninguna foreign key (no hay ADD CONSTRAINT ... FOREIGN KEY ni REFERENCES)', () => {
    expect(codeOnly).not.toMatch(/FOREIGN KEY|REFERENCES/i);
  });
});
