/**
 * 20260910140000_merchant_mp_payment_events.sql — tests estáticos
 * (source-scan) de RLS/REVOKE y de las garantías de idempotencia. No
 * hay entorno Postgres en Vitest -- ver el dry-run manual documentado
 * en el reporte de MP-CHECKOUT-2 para la verificación funcional real.
 */
import { describe, it, expect } from 'vitest';
import migrationSource from './20260910140000_merchant_mp_payment_events.sql?raw';

describe('wa_merchant_payment_events — RLS + REVOKE (sin acceso directo del cliente)', () => {
  it('RLS habilitado', () => {
    expect(migrationSource).toMatch(/ALTER TABLE public\.wa_merchant_payment_events ENABLE ROW LEVEL SECURITY/);
  });

  it('revoca todo acceso a PUBLIC, anon y authenticated', () => {
    expect(migrationSource).toMatch(/REVOKE ALL ON TABLE public\.wa_merchant_payment_events FROM PUBLIC, anon, authenticated/);
  });

  it('no existe ninguna CREATE POLICY sobre esta tabla', () => {
    expect(migrationSource).not.toMatch(/CREATE POLICY[^;]*ON public\.wa_merchant_payment_events/s);
  });

  it('mp_payment_id es UNIQUE -- clave de idempotencia', () => {
    expect(migrationSource).toMatch(/CONSTRAINT wa_merchant_payment_events_mp_payment_id_unique UNIQUE \(mp_payment_id\)/);
  });

  it('nunca tiene una columna para access_token/refresh_token/client_secret', () => {
    const tableMatch = migrationSource.match(/CREATE TABLE public\.wa_merchant_payment_events \([\s\S]*?\n\);/);
    expect(tableMatch).not.toBeNull();
    expect(tableMatch![0]).not.toMatch(/token|secret/i);
  });
});

describe('wa_process_merchant_payment_event — service_role-only, atómica', () => {
  it('revoca todo acceso a PUBLIC, anon y authenticated', () => {
    expect(migrationSource).toMatch(
      /REVOKE ALL ON FUNCTION public\.wa_process_merchant_payment_event\(\s*\n\s*UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT\s*\n\)\s*FROM PUBLIC, anon, authenticated/,
    );
  });

  it('no existe ningún GRANT EXECUTE a authenticated ni anon', () => {
    expect(migrationSource).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.wa_process_merchant_payment_event[^;]*TO (authenticated|anon)/);
  });

  it('es SECURITY DEFINER con search_path fijo', () => {
    const fnMatch = migrationSource.match(
      /CREATE OR REPLACE FUNCTION public\.wa_process_merchant_payment_event[\s\S]*?SET search_path = public, extensions/,
    );
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![0]).toMatch(/SECURITY DEFINER/);
  });

  it('lockea la fila existente (SELECT...FOR UPDATE) ANTES de cualquier side-effect -- gate de concurrencia', () => {
    const forUpdateIdx = migrationSource.indexOf('FOR UPDATE');
    const updateOrdersIdx = migrationSource.indexOf("UPDATE public.wa_orders\n       SET payment_status = 'pagado'");
    const insertStockIdx = migrationSource.indexOf('INSERT INTO public.crm_stock_movements');
    expect(forUpdateIdx).toBeGreaterThan(-1);
    expect(updateOrdersIdx).toBeGreaterThan(-1);
    expect(insertStockIdx).toBeGreaterThan(-1);
    expect(forUpdateIdx).toBeLessThan(updateOrdersIdx);
    expect(forUpdateIdx).toBeLessThan(insertStockIdx);
  });

  it('nunca aplica side-effects si stock_applied_at ya está seteado -- gate de "no doble descuento"', () => {
    expect(migrationSource).toMatch(/IF FOUND AND v_existing\.stock_applied_at IS NOT NULL THEN/);
  });

  it('marca stock_applied_at DESPUÉS de generar los movimientos de stock, dentro del mismo bloque approved', () => {
    const insertStockIdx = migrationSource.indexOf('INSERT INTO public.crm_stock_movements');
    const markAppliedIdx = migrationSource.indexOf('SET stock_applied_at = now()');
    expect(insertStockIdx).toBeGreaterThan(-1);
    expect(markAppliedIdx).toBeGreaterThan(-1);
    expect(insertStockIdx).toBeLessThan(markAppliedIdx);
  });

  it('filtra explícitamente por stock_actual IS NOT NULL antes de insertar movimientos de stock', () => {
    expect(migrationSource).toMatch(/AND p\.stock_actual IS NOT NULL/);
  });

  it('nunca hace UPDATE directo de wa_products.stock_actual -- solo vía crm_stock_movements', () => {
    expect(migrationSource).not.toMatch(/UPDATE public\.wa_products/);
  });

  it('rejected/cancelled nunca revierten un pedido ya pagado (solo actualiza si payment_status=\'pendiente\')', () => {
    expect(migrationSource).toMatch(/WHERE id = p_order_id AND payment_status = 'pendiente'/);
  });

  it('valida amount/currency contra wa_orders como defensa en profundidad antes de marcar pagado', () => {
    expect(migrationSource).toMatch(/AMOUNT_CURRENCY_MISMATCH/);
    const mismatchIdx = migrationSource.indexOf('AMOUNT_CURRENCY_MISMATCH');
    const updatePagadoIdx = migrationSource.indexOf("SET payment_status = 'pagado'");
    expect(mismatchIdx).toBeLessThan(updatePagadoIdx);
  });
});

describe('no usa crm_payments ni toca billing', () => {
  it('no contiene ninguna referencia real (INSERT/UPDATE/SELECT/REFERENCES) a crm_payments', () => {
    expect(migrationSource).not.toMatch(/(INSERT INTO|UPDATE|SELECT[^;]*FROM|REFERENCES)\s+public\.crm_payments\b/i);
  });

  it('no contiene SQL real sobre wa_payments, wa_payment_events o billing_subscriptions', () => {
    expect(migrationSource).not.toMatch(/(INSERT INTO|UPDATE|SELECT[^;]*FROM|REFERENCES)\s+public\.(wa_payments|wa_payment_events|billing_subscriptions)\b/i);
  });
});
