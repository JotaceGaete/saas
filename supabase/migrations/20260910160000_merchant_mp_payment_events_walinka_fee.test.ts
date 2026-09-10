/**
 * 20260910160000_merchant_mp_payment_events_walinka_fee.sql — tests
 * estáticos (source-scan) de la columna walinka_fee y de la RPC
 * actualizada. No hay entorno Postgres en Vitest -- mismo criterio que
 * 20260910140000_merchant_mp_payment_events.test.ts.
 */
import { describe, it, expect } from 'vitest';
import migrationSource from './20260910160000_merchant_mp_payment_events_walinka_fee.sql?raw';

describe('wa_merchant_payment_events.walinka_fee', () => {
  it('agrega la columna NUMERIC(12,2) NOT NULL DEFAULT 0', () => {
    expect(migrationSource).toMatch(
      /ALTER TABLE public\.wa_merchant_payment_events\s*\n\s*ADD COLUMN IF NOT EXISTS walinka_fee NUMERIC\(12,2\) NOT NULL DEFAULT 0;/,
    );
  });

  it('no renombra ninguna columna existente (sin RENAME COLUMN)', () => {
    expect(migrationSource).not.toMatch(/RENAME COLUMN/i);
  });

  it('no introduce mp_fee ni seller_net_amount en esta fase (mínima a propósito)', () => {
    expect(migrationSource).not.toMatch(/ADD COLUMN[^;]*mp_fee/);
    expect(migrationSource).not.toMatch(/ADD COLUMN[^;]*seller_net_amount/);
  });
});

describe('wa_process_merchant_payment_event — firma actualizada (DROP + CREATE)', () => {
  it('elimina la firma anterior de 8 parámetros antes de recrear la función', () => {
    expect(migrationSource).toMatch(
      /DROP FUNCTION IF EXISTS public\.wa_process_merchant_payment_event\(\s*\n\s*UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT\s*\n\);/,
    );
  });

  it('la nueva firma agrega p_walinka_fee NUMERIC como noveno parámetro, sin DEFAULT (requerido)', () => {
    const fnMatch = migrationSource.match(/CREATE OR REPLACE FUNCTION public\.wa_process_merchant_payment_event\(([\s\S]*?)\)\nRETURNS/);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![1]).toMatch(/p_walinka_fee\s+NUMERIC\s*$/m);
    expect(fnMatch![1]).not.toMatch(/p_walinka_fee\s+NUMERIC\s+DEFAULT/);
  });

  it('p_walinka_fee es validado como requerido junto al resto de parámetros obligatorios', () => {
    expect(migrationSource).toMatch(/OR p_walinka_fee IS NULL\s*\n\s*THEN\s*\n\s*RAISE EXCEPTION 'MISSING_REQUIRED_PARAMETER'/);
  });

  it('revoca todo acceso a PUBLIC, anon y authenticated con la nueva firma de 9 parámetros', () => {
    expect(migrationSource).toMatch(
      /REVOKE ALL ON FUNCTION public\.wa_process_merchant_payment_event\(\s*\n\s*UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, NUMERIC\s*\n\)\s*FROM PUBLIC, anon, authenticated/,
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
});

describe('wa_process_merchant_payment_event — walinka_fee persistida sin debilitar invariantes existentes', () => {
  it('walinka_fee se inserta en el INSERT inicial del ledger', () => {
    const insertMatch = migrationSource.match(/INSERT INTO public\.wa_merchant_payment_events \([\s\S]*?\)\s*VALUES \([\s\S]*?\);/);
    expect(insertMatch).not.toBeNull();
    expect(insertMatch![0]).toMatch(/walinka_fee/);
    expect(insertMatch![0]).toMatch(/p_walinka_fee/);
  });

  it('walinka_fee se actualiza (nunca se acumula) en el ON CONFLICT DO UPDATE', () => {
    expect(migrationSource).toMatch(/ON CONFLICT \(mp_payment_id\) DO UPDATE SET[\s\S]*?walinka_fee\s*=\s*EXCLUDED\.walinka_fee/);
  });

  it('sigue lockeando la fila existente (SELECT...FOR UPDATE) ANTES de cualquier side-effect', () => {
    const forUpdateIdx = migrationSource.indexOf('FOR UPDATE');
    const updateOrdersIdx = migrationSource.indexOf("UPDATE public.wa_orders\n       SET payment_status = 'pagado'");
    const insertStockIdx = migrationSource.indexOf('INSERT INTO public.crm_stock_movements');
    expect(forUpdateIdx).toBeGreaterThan(-1);
    expect(updateOrdersIdx).toBeGreaterThan(-1);
    expect(insertStockIdx).toBeGreaterThan(-1);
    expect(forUpdateIdx).toBeLessThan(updateOrdersIdx);
    expect(forUpdateIdx).toBeLessThan(insertStockIdx);
  });

  it('nunca aplica side-effects (ni vuelve a tocar walinka_fee) si stock_applied_at ya está seteado -- gate de "no doble descuento/no doble comisión"', () => {
    const gateMatch = migrationSource.match(/IF FOUND AND v_existing\.stock_applied_at IS NOT NULL THEN\s*\n[\s\S]*?RETURN;\s*\n\s*END IF;/);
    expect(gateMatch).not.toBeNull();
    expect(gateMatch![0]).not.toMatch(/walinka_fee/);
    expect(gateMatch![0]).not.toMatch(/INSERT INTO public\.crm_stock_movements/);
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

  it('valida amount/currency contra wa_orders como defensa en profundidad antes de marcar pagado -- invariante NO debilitada', () => {
    expect(migrationSource).toMatch(/AMOUNT_CURRENCY_MISMATCH/);
    const mismatchIdx = migrationSource.indexOf('AMOUNT_CURRENCY_MISMATCH');
    const updatePagadoIdx = migrationSource.indexOf("SET payment_status = 'pagado'");
    expect(mismatchIdx).toBeLessThan(updatePagadoIdx);
  });
});

describe('no usa crm_payments ni toca billing/OAuth', () => {
  it('no contiene ninguna referencia real (INSERT/UPDATE/SELECT/REFERENCES) a crm_payments', () => {
    expect(migrationSource).not.toMatch(/(INSERT INTO|UPDATE|SELECT[^;]*FROM|REFERENCES)\s+public\.crm_payments\b/i);
  });

  it('no contiene SQL real sobre wa_payments, wa_payment_events, billing_subscriptions o mp_connections', () => {
    expect(migrationSource).not.toMatch(
      /(INSERT INTO|UPDATE|SELECT[^;]*FROM|REFERENCES)\s+public\.(wa_payments|wa_payment_events|billing_subscriptions|mp_connections)\b/i,
    );
  });
});
