/**
 * 20260916100000_crm_pos_payment_methods.sql — tests estáticos
 * (source-scan) del hotfix TPV-PAYMENT-METHODS-1. Mismo criterio que el
 * resto de las migraciones de este repo (`npx vitest run` no tiene
 * Postgres disponible): esta suite prueba que el DDL/RPC correcto existe
 * en el código fuente. El comportamiento real contra datos vive en
 * supabase/diagnostics/verify_crm_pos_payment_methods.sql.
 */
import { describe, it, expect } from 'vitest';
import migrationSource from './20260916100000_crm_pos_payment_methods.sql?raw';
import previousSource from './20260911000000_tpv_stock_insufficient_details.sql?raw';

const fnMatch = migrationSource.match(
  /CREATE OR REPLACE FUNCTION public\.crm_create_pos_sale\([\s\S]*?\$\$;/,
);
const fnSource = fnMatch ? fnMatch[0] : '';

const previousFnMatch = previousSource.match(
  /CREATE OR REPLACE FUNCTION public\.crm_create_pos_sale\([\s\S]*?\$\$;/,
);
const previousFnSource = previousFnMatch ? previousFnMatch[0] : '';

const stripComments = (src: string) =>
  src
    .split('\n')
    .map((line) => line.replace(/--.*$/, '').replace(/\s+$/, ''))
    .filter((line) => line.trim() !== '')
    .join('\n');

describe('TPV-PAYMENT-METHODS-1 — la RPC existe y reemplaza in place', () => {
  it('crm_create_pos_sale existe con CREATE OR REPLACE (misma firma, no una función nueva)', () => {
    expect(fnMatch).not.toBeNull();
    expect(migrationSource).toMatch(
      /CREATE OR REPLACE FUNCTION public\.crm_create_pos_sale\(\s*p_business_id\s*UUID,\s*p_idempotency_key\s*TEXT,\s*p_items\s*JSONB,\s*p_issue_date\s*DATE,\s*p_customer_id\s*UUID DEFAULT NULL,\s*p_discount\s*NUMERIC DEFAULT 0,\s*p_payments\s*JSONB DEFAULT '\[\]'::jsonb,\s*p_notes\s*TEXT DEFAULT NULL,\s*p_currency\s*TEXT DEFAULT 'CLP'\s*\)/,
    );
  });

  it('conserva SECURITY DEFINER y SET search_path = public', () => {
    expect(fnSource).toMatch(/SECURITY DEFINER/);
    expect(fnSource).toMatch(/SET search_path = public/);
  });

  it('conserva REVOKE ALL FROM PUBLIC + GRANT EXECUTE TO authenticated con la misma firma', () => {
    expect(migrationSource).toMatch(
      /REVOKE ALL ON FUNCTION public\.crm_create_pos_sale\(UUID, TEXT, JSONB, DATE, UUID, NUMERIC, JSONB, TEXT, TEXT\) FROM PUBLIC;/,
    );
    expect(migrationSource).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.crm_create_pos_sale\(UUID, TEXT, JSONB, DATE, UUID, NUMERIC, JSONB, TEXT, TEXT\) TO authenticated;/,
    );
  });

  it('no crea ninguna otra función ni tabla nueva -- es exclusivamente CREATE OR REPLACE de crm_create_pos_sale', () => {
    const createStatements = stripComments(migrationSource).match(/CREATE (OR REPLACE )?(FUNCTION|TABLE)/g) || [];
    expect(createStatements).toEqual(['CREATE OR REPLACE FUNCTION']);
  });
});

describe('TPV-PAYMENT-METHODS-1 — vocabulario de medios de pago', () => {
  it('acepta exactamente los 8 medios requeridos, en el IF de validación de p_payments', () => {
    expect(fnSource).toMatch(
      /IF v_method NOT IN \('cash', 'card', 'debit_card', 'credit_card', 'bank_transfer', 'mercado_pago', 'check', 'other'\) THEN/,
    );
  });

  it("conserva 'card' (compatibilidad histórica) -- no lo reemplaza ni lo quita", () => {
    expect(fnSource).toMatch(/'cash', 'card', 'debit_card'/);
  });

  it("NO agrega 'credit' al vocabulario -- cuenta corriente sigue sin ser un medio de pago válido acá", () => {
    const ifLine = fnSource.match(/IF v_method NOT IN \([^)]*\) THEN/)[0];
    expect(ifLine).not.toMatch(/'credit'/);
  });

  it('sigue rechazando con INVALID_PAYMENT / SQLSTATE 23514', () => {
    expect(fnSource).toMatch(/RAISE EXCEPTION 'INVALID_PAYMENT' USING ERRCODE = '23514';/);
  });

  it("el chequeo \"solo cash genera vuelto\" (v_method <> 'cash') no cambió -- agrupa genéricamente todo no-efectivo", () => {
    expect(fnSource).toMatch(/IF v_method <> 'cash' THEN\s*\n\s*v_non_cash_total := v_non_cash_total \+ v_amount;/);
    expect(fnSource).toMatch(/IF v_non_cash_total > v_total THEN\s*\n\s*RAISE EXCEPTION 'INVALID_PAYMENT' USING ERRCODE = '23514';/);
  });

  it('payment_method se persiste como v_method sin reclasificar (debit_card/credit_card/mercado_pago no se mapean a card/other)', () => {
    expect(fnSource).toMatch(/payment_method[\s\S]{0,400}v_method, 'received'/);
    expect(fnSource).not.toMatch(/v_method\s*=\s*'debit_card'\s*THEN\s*'card'/);
    expect(fnSource).not.toMatch(/v_method\s*=\s*'credit_card'\s*THEN\s*'card'/);
    expect(fnSource).not.toMatch(/v_method\s*=\s*'mercado_pago'\s*THEN\s*'other'/);
  });
});

describe('TPV-PAYMENT-METHODS-1 — todo lo demás queda preservado byte a byte', () => {
  // Compara el cuerpo completo de la función NUEVA contra el cuerpo de la
  // versión VIGENTE anterior (20260911000000), línea por línea, y verifica
  // que el único bloque de líneas distinto es el del vocabulario de medios
  // de pago (más comentarios). Si esta prueba falla, algo más además del
  // vocabulario cambió -- exactamente lo que TPV-PAYMENT-METHODS-1 prohíbe.

  it('el cuerpo (sin comentarios) es idéntico salvo la línea del IF de medios de pago', () => {
    const a = stripComments(previousFnSource).split('\n');
    const b = stripComments(fnSource).split('\n');
    const diffLines = [];
    const max = Math.max(a.length, b.length);
    for (let i = 0; i < max; i++) {
      if (a[i] !== b[i]) diffLines.push({ line: i, before: a[i], after: b[i] });
    }
    // Debe haber EXACTAMENTE una línea distinta: el IF de vocabulario.
    expect(diffLines).toHaveLength(1);
    expect(diffLines[0].before).toMatch(/IF v_method NOT IN \('cash', 'card', 'bank_transfer', 'check', 'other'\) THEN/);
    expect(diffLines[0].after).toMatch(/IF v_method NOT IN \('cash', 'card', 'debit_card', 'credit_card', 'bank_transfer', 'mercado_pago', 'check', 'other'\) THEN/);
  });

  it('conserva STOCK_INSUFFICIENT:<product_id>:<requested>:<available> de TPV-STOCK-UX-1', () => {
    expect(fnSource).toMatch(
      /RAISE EXCEPTION 'STOCK_INSUFFICIENT:%:%:%', v_agg\.product_id, v_agg\.total_qty, v_stock_actual/,
    );
  });

  it('conserva el lock FOR UPDATE sobre wa_products antes de validar stock', () => {
    expect(fnSource).toMatch(/FROM public\.wa_products\s*\n\s*WHERE id = v_agg\.product_id AND business_id = p_business_id\s*\n\s*FOR UPDATE;/);
  });

  it('conserva el lock FOR UPDATE sobre la sesión de caja abierta', () => {
    expect(fnSource).toMatch(/WHERE business_id = p_business_id AND status = 'open'[\s\S]{0,80}FOR UPDATE;/);
  });

  it('conserva pg_advisory_xact_lock de idempotencia (business_id + idempotency_key)', () => {
    expect(fnSource).toMatch(/PERFORM pg_advisory_xact_lock\(hashtextextended\(p_business_id::text \|\| ':' \|\| p_idempotency_key, 0\)\);/);
  });

  it('conserva CREDIT_NO_CUSTOMER y NO_OPEN_CASH sin cambios', () => {
    expect(fnSource).toMatch(/RAISE EXCEPTION 'CREDIT_NO_CUSTOMER' USING ERRCODE = 'P0001';/);
    expect(fnSource).toMatch(/RAISE EXCEPTION 'NO_OPEN_CASH' USING ERRCODE = 'P0001';/);
  });

  it('conserva la asociación cash_session_id en el INSERT de crm_payments', () => {
    expect(fnSource).toMatch(/cash_session_id, reference, notes, created_by[\s\S]{0,200}v_open_session_id,/);
  });
});
