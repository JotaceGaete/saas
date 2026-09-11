/**
 * 20260911000000_tpv_stock_insufficient_details.sql — tests estáticos
 * (source-scan) de crm_create_pos_sale con STOCK_INSUFFICIENT
 * estructurado. Mismo criterio y misma limitación explícita que
 * 20260910220000_crm_pos_atomic_sale.test.ts: no hay entorno Postgres en
 * Vitest, así que esto prueba que el mecanismo correcto está en el
 * código fuente (el nuevo formato del mensaje, en el lugar correcto,
 * bajo el mismo lock/validación de siempre) -- NO que Postgres realmente
 * lo ejecuta así. Eso solo puede confirmarse contra un Postgres real.
 */
import { describe, it, expect } from 'vitest';
import migrationSource from './20260911000000_tpv_stock_insufficient_details.sql?raw';
import originalMigrationSource from './20260910220000_crm_pos_atomic_sale.sql?raw';

const posSaleFnMatch = migrationSource.match(
  /CREATE OR REPLACE FUNCTION public\.crm_create_pos_sale\([\s\S]*?\$\$;/,
);

describe('20260911000000 — reemplaza crm_create_pos_sale con la MISMA firma exacta', () => {
  it('la función existe', () => {
    expect(posSaleFnMatch).not.toBeNull();
  });

  it('la firma (lista de parámetros) es idéntica a la de la migración original -- CREATE OR REPLACE, no un rename/overload', () => {
    const originalSigMatch = originalMigrationSource.match(
      /CREATE OR REPLACE FUNCTION public\.crm_create_pos_sale\(\s*\n([\s\S]*?)\n\)\s*\nRETURNS SETOF/,
    );
    const newSigMatch = migrationSource.match(
      /CREATE OR REPLACE FUNCTION public\.crm_create_pos_sale\(\s*\n([\s\S]*?)\n\)\s*\nRETURNS SETOF/,
    );
    expect(originalSigMatch).not.toBeNull();
    expect(newSigMatch).not.toBeNull();
    expect(newSigMatch[1]).toBe(originalSigMatch[1]);
  });

  it('no toca crm_apply_stock_movement ni ninguna otra función/tabla', () => {
    expect(migrationSource).not.toMatch(/CREATE OR REPLACE FUNCTION public\.crm_apply_stock_movement/);
    expect(migrationSource).not.toMatch(/ALTER TABLE/);
    expect(migrationSource).not.toMatch(/CREATE (UNIQUE )?INDEX/);
  });

  it('no modifica wa_orders, Mercado Pago, webhooks, fiscal ni gastronomía', () => {
    expect(migrationSource).not.toMatch(/wa_orders|mercado_pago|mercadopago|webhook/i);
  });
});

describe('STOCK_INSUFFICIENT ahora lleva product_id, cantidad solicitada y disponible', () => {
  it('el nuevo formato es STOCK_INSUFFICIENT:%:%:% con v_agg.product_id, v_agg.total_qty, v_stock_actual en ese orden', () => {
    expect(posSaleFnMatch[0]).toMatch(
      /RAISE EXCEPTION 'STOCK_INSUFFICIENT:%:%:%', v_agg\.product_id, v_agg\.total_qty, v_stock_actual\s*\n\s*USING ERRCODE = 'P0001';/,
    );
  });

  it('sigue empezando con el literal STOCK_INSUFFICIENT -- backward-compatible con mapPosSaleError (raw.includes(\'STOCK_INSUFFICIENT\'))', () => {
    const raiseMatch = posSaleFnMatch[0].match(/RAISE EXCEPTION '(STOCK_INSUFFICIENT[^']*)'/);
    expect(raiseMatch).not.toBeNull();
    expect(raiseMatch[1].startsWith('STOCK_INSUFFICIENT')).toBe(true);
  });

  it('la validación de stock sigue evaluándose bajo el mismo SELECT ... FOR UPDATE (el lock no se debilitó)', () => {
    const stockBlockMatch = posSaleFnMatch[0].match(
      /SELECT stock_actual INTO v_stock_actual\s*\n\s*FROM public\.wa_products\s*\n\s*WHERE id = v_agg\.product_id AND business_id = p_business_id\s*\n\s*FOR UPDATE;[\s\S]*?RAISE EXCEPTION 'STOCK_INSUFFICIENT:/,
    );
    expect(stockBlockMatch).not.toBeNull();
  });

  it('stock_actual IS NULL (sin control de stock) sigue sin validarse -- la condición IS NOT NULL se preserva', () => {
    expect(posSaleFnMatch[0]).toMatch(
      /IF v_stock_actual IS NOT NULL AND v_stock_actual < v_agg\.total_qty THEN\s*\n\s*RAISE EXCEPTION 'STOCK_INSUFFICIENT:/,
    );
  });

  it('la agregación por product_id (suma de todas las líneas del mismo producto) se preserva -- no se validó línea por línea', () => {
    expect(posSaleFnMatch[0]).toMatch(
      /SELECT NULLIF\(line->>'product_id', ''\)::UUID AS product_id,\s*\n\s*SUM\(COALESCE\(\(line->>'quantity'\)::INTEGER, 0\)\) AS total_qty/,
    );
  });
});

describe('el resto de la función es exactamente igual (no se reimplementó nada de pagos/cuenta corriente/caja/idempotencia)', () => {
  it('conserva pg_advisory_xact_lock, la búsqueda de idempotencia, y el resto de las excepciones tal cual', () => {
    expect(posSaleFnMatch[0]).toMatch(/PERFORM pg_advisory_xact_lock\(hashtextextended\(p_business_id::text \|\| ':' \|\| p_idempotency_key, 0\)\);/);
    expect(posSaleFnMatch[0]).toMatch(/RAISE EXCEPTION 'NOT_AUTHENTICATED'/);
    expect(posSaleFnMatch[0]).toMatch(/RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'/);
    expect(posSaleFnMatch[0]).toMatch(/RAISE EXCEPTION 'PRODUCT_NOT_FOUND'/);
    expect(posSaleFnMatch[0]).toMatch(/RAISE EXCEPTION 'INVALID_ITEMS'/);
    expect(posSaleFnMatch[0]).toMatch(/RAISE EXCEPTION 'INVALID_PAYMENT'/);
    expect(posSaleFnMatch[0]).toMatch(/RAISE EXCEPTION 'CREDIT_NO_CUSTOMER'/);
    expect(posSaleFnMatch[0]).toMatch(/RAISE EXCEPTION 'NO_OPEN_CASH'/);
  });

  it('conserva el cálculo de pago mixto/vuelto (v_non_cash_total, v_remaining_for_cash) sin cambios de fórmula', () => {
    expect(posSaleFnMatch[0]).toMatch(/IF v_non_cash_total > v_total THEN/);
    expect(posSaleFnMatch[0]).toMatch(/v_remaining_for_cash := GREATEST\(v_total - v_non_cash_total, 0\);/);
  });

  it('sigue insertando exactamente invoice + items + payments + stock movements, en ese orden, dentro de la misma función', () => {
    const body = posSaleFnMatch[0];
    const invoiceIdx = body.indexOf('INSERT INTO public.crm_invoices (');
    const itemsIdx = body.indexOf('INSERT INTO public.crm_invoice_items (');
    const paymentsIdx = body.indexOf('INSERT INTO public.crm_payments (');
    const stockIdx = body.indexOf('INSERT INTO public.crm_stock_movements');
    expect(invoiceIdx).toBeGreaterThan(-1);
    expect(itemsIdx).toBeGreaterThan(invoiceIdx);
    expect(paymentsIdx).toBeGreaterThan(itemsIdx);
    expect(stockIdx).toBeGreaterThan(paymentsIdx);
  });
});

describe('GRANT/REVOKE y comentario de la función se reafirman con la misma firma', () => {
  it('REVOKE ALL FROM PUBLIC + GRANT EXECUTE TO authenticated, misma lista de tipos', () => {
    expect(migrationSource).toMatch(
      /REVOKE ALL ON FUNCTION public\.crm_create_pos_sale\(UUID, TEXT, JSONB, DATE, UUID, NUMERIC, JSONB, TEXT, TEXT\) FROM PUBLIC;/,
    );
    expect(migrationSource).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.crm_create_pos_sale\(UUID, TEXT, JSONB, DATE, UUID, NUMERIC, JSONB, TEXT, TEXT\) TO authenticated;/,
    );
  });

  it('el comentario documenta el nuevo formato de STOCK_INSUFFICIENT', () => {
    expect(migrationSource).toMatch(/STOCK_INSUFFICIENT:<product_id>:<requested_quantity>:<available_quantity>/);
  });

  it('recarga el schema de PostgREST al final (NOTIFY pgrst)', () => {
    expect(migrationSource.trim().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true);
  });
});
