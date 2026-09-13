/**
 * 20260913170000_crm_cash_movements_purpose.sql — tests estáticos
 * (source-scan) de CAJA-COSTOS-1. Mismo criterio que el resto de las
 * migraciones de este repo (`npx vitest run` no tiene Postgres
 * disponible): esta suite prueba que el DDL/DML correcto existe en el
 * código fuente, no que Postgres lo ejecuta.
 */
import { describe, it, expect } from 'vitest';
import migrationSource from './20260913170000_crm_cash_movements_purpose.sql?raw';

const codeOnly = migrationSource
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');

describe('CAJA-COSTOS-1 — movement_purpose', () => {
  it('agrega movement_purpose como TEXT NULL (nullable, sin NOT NULL/DEFAULT)', () => {
    const columnDef = codeOnly.match(/ADD COLUMN IF NOT EXISTS movement_purpose[^\n]*/)[0];
    expect(columnDef).toMatch(/TEXT NULL/);
    expect(columnDef).not.toMatch(/NOT NULL/);
    expect(columnDef).not.toMatch(/DEFAULT/);
  });

  it('el CHECK permite NULL o uno de los 5 valores soportados (+ transfer reservado)', () => {
    const checkMatch = codeOnly.match(/CHECK\s*\(\s*movement_purpose IS NULL OR movement_purpose IN \(([\s\S]*?)\)\s*\)/);
    expect(checkMatch).toBeTruthy();
    const values = checkMatch[1];
    for (const value of ['new_expense', 'cost_payment', 'inventory_purchase', 'owner_withdrawal', 'other_non_operating', 'transfer']) {
      expect(values).toContain(`'${value}'`);
    }
  });

  it('no hace backfill: ningún UPDATE toca filas existentes de crm_cash_movements', () => {
    expect(codeOnly).not.toMatch(/UPDATE\s+(public\.)?crm_cash_movements\s+SET\s+movement_purpose/i);
  });
});

describe('CAJA-COSTOS-1 — related_cost_item_id', () => {
  it('es distinto de cost_item_id, nullable, referencia crm_cost_items con ON DELETE SET NULL', () => {
    expect(codeOnly).toMatch(/ADD COLUMN IF NOT EXISTS related_cost_item_id UUID NULL\s+REFERENCES public\.crm_cost_items\(id\) ON DELETE SET NULL/);
  });

  it('no reutiliza ni redefine cost_item_id', () => {
    expect(codeOnly).not.toMatch(/ALTER TABLE public\.crm_cash_movements[\s\S]{0,200}\bcost_item_id\b(?!.*related)/);
  });
});

describe('CAJA-COSTOS-1 — no toca create_cash_movement_with_expense ni RLS', () => {
  it('no redefine ni elimina create_cash_movement_with_expense', () => {
    expect(codeOnly).not.toMatch(/CREATE OR REPLACE FUNCTION public\.create_cash_movement_with_expense/);
    expect(codeOnly).not.toMatch(/DROP FUNCTION[\s\S]{0,60}create_cash_movement_with_expense/i);
  });

  it('no crea, altera ni elimina políticas RLS', () => {
    expect(codeOnly).not.toMatch(/CREATE POLICY|DROP POLICY|ALTER POLICY/i);
  });

  it('no habilita/deshabilita RLS en ninguna tabla', () => {
    expect(codeOnly).not.toMatch(/ROW LEVEL SECURITY/i);
  });
});

describe('CAJA-COSTOS-1 — RPC create_cash_movement_with_purpose', () => {
  const rpcMatch = migrationSource.match(
    /CREATE OR REPLACE FUNCTION public\.create_cash_movement_with_purpose\([\s\S]*?\$\$;/,
  );

  it('el RPC existe', () => {
    expect(rpcMatch).toBeTruthy();
  });

  const rpcSource = rpcMatch ? rpcMatch[0] : '';

  it('valida ownership del negocio contra auth.uid()', () => {
    expect(rpcSource).toMatch(/user_id\s*=\s*auth\.uid\(\)/);
  });

  it('valida que movement_purpose sea uno de los 5 valores soportados por este RPC (transfer excluido -- no implementado)', () => {
    expect(rpcSource).toMatch(/p_movement_purpose NOT IN \(/);
    expect(rpcSource).toMatch(/'new_expense'/);
    expect(rpcSource).toMatch(/'cost_payment'/);
    expect(rpcSource).toMatch(/'inventory_purchase'/);
    expect(rpcSource).toMatch(/'owner_withdrawal'/);
    expect(rpcSource).toMatch(/'other_non_operating'/);
    // transfer no debe ser un valor aceptado por ESTE RPC todavía
    const validationBlock = rpcSource.match(/p_movement_purpose NOT IN \(([\s\S]*?)\)/)[1];
    expect(validationBlock).not.toContain("'transfer'");
  });

  it('valida que related_cost_item_id pertenezca al mismo business_id', () => {
    expect(rpcSource).toMatch(/related_cost_item_id[\s\S]{0,20}IS NOT NULL AND NOT EXISTS/);
    expect(rpcSource).toMatch(/business_id\s*=\s*p_business_id/);
  });

  it('solo new_expense crea el crm_cost_item (v_creates_cost)', () => {
    expect(rpcSource).toMatch(/v_creates_cost\s*:=\s*\(p_movement_purpose = 'new_expense'\)/);
    expect(rpcSource).toMatch(/IF v_creates_cost THEN/);
  });

  it('related_cost_item_id solo se persiste para cost_payment (no para las otras 4 opciones)', () => {
    expect(rpcSource).toMatch(/CASE WHEN p_movement_purpose = 'cost_payment' THEN p_related_cost_item_id ELSE NULL END/);
  });

  it('el crm_cost_item creado sigue siendo type=variable, source=cash_outflow (mismo contrato que el RPC legacy)', () => {
    expect(rpcSource).toMatch(/'variable', v_cost_category/);
    expect(rpcSource).toMatch(/'cash_outflow', v_movement\.id/);
  });

  it('mapea other_expense -> other igual que el RPC legacy', () => {
    expect(rpcSource).toMatch(/WHEN 'other_expense' THEN 'other'/);
  });
});
