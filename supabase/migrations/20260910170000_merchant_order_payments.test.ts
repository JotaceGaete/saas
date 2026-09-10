/**
 * 20260910170000_merchant_order_payments.sql — tests estáticos
 * (source-scan) de wa_order_payments: constraints, idempotencia, RLS/
 * REVOKE, la extensión de wa_process_merchant_payment_event, la RPC
 * manual, y el backfill. No hay entorno Postgres en Vitest -- mismo
 * criterio que 20260910140000/20260910160000.
 */
import { describe, it, expect } from 'vitest';
import migrationSource from './20260910170000_merchant_order_payments.sql?raw';

describe('wa_order_payments — tabla y constraints', () => {
  const tableMatch = migrationSource.match(/CREATE TABLE public\.wa_order_payments \([\s\S]*?\n\);/);

  it('la tabla existe con las columnas mínimas requeridas', () => {
    expect(tableMatch).not.toBeNull();
    const cols = [
      'id', 'business_id', 'order_id', 'provider', 'method', 'provider_payment_id',
      'status', 'gross_amount', 'currency', 'walinka_fee', 'mp_fee', 'net_amount',
      'payer_name', 'payer_email', 'paid_at', 'registered_by', 'notes',
      'created_at', 'updated_at',
    ];
    for (const col of cols) {
      expect(tableMatch![0]).toMatch(new RegExp(`\\b${col}\\b`));
    }
  });

  it('provider/method tienen CHECK de vocabulario cerrado', () => {
    expect(tableMatch![0]).toMatch(/provider IN \('mercado_pago', 'manual'\)/);
    expect(tableMatch![0]).toMatch(/method\s+IN \('checkout_pro', 'point', 'qr', 'cash', 'bank_transfer', 'other'\)/);
  });

  it('CHECK de coherencia provider/method: mercado_pago solo con checkout_pro|point|qr, manual solo con cash|bank_transfer|other', () => {
    expect(tableMatch![0]).toMatch(
      /provider = 'mercado_pago' AND method IN \('checkout_pro', 'point', 'qr'\)/,
    );
    expect(tableMatch![0]).toMatch(
      /provider = 'manual' AND method IN \('cash', 'bank_transfer', 'other'\)/,
    );
  });

  it('CHECK: provider_payment_id obligatorio para mercado_pago, prohibido para manual', () => {
    expect(tableMatch![0]).toMatch(/provider = 'mercado_pago' AND provider_payment_id IS NOT NULL/);
    expect(tableMatch![0]).toMatch(/provider = 'manual' AND provider_payment_id IS NULL/);
  });

  it('CHECK: walinka_fee = 0 obligatorio para pagos manuales (decisión de producto #2, forzada estructuralmente)', () => {
    expect(tableMatch![0]).toMatch(/wa_order_payments_manual_zero_fee_check CHECK \(\s*provider <> 'manual' OR walinka_fee = 0/);
  });

  it('status restringido a confirmed|voided', () => {
    expect(tableMatch![0]).toMatch(/status IN \('confirmed', 'voided'\)/);
  });

  it('gross_amount > 0 y walinka_fee >= 0', () => {
    expect(tableMatch![0]).toMatch(/gross_amount > 0/);
    expect(tableMatch![0]).toMatch(/walinka_fee >= 0/);
  });

  it('walinka_fee tiene DEFAULT 0 (nunca NULL, decisión de producto #2)', () => {
    expect(tableMatch![0]).toMatch(/walinka_fee\s+NUMERIC\(12,2\) NOT NULL DEFAULT 0/);
  });

  it('mp_fee y net_amount son NULLABLE (nunca inventados en esta fase)', () => {
    expect(tableMatch![0]).not.toMatch(/mp_fee\s+NUMERIC\(12,2\) NOT NULL/);
    expect(tableMatch![0]).not.toMatch(/net_amount\s+NUMERIC\(12,2\) NOT NULL/);
  });

  it('paid_at es NOT NULL (siempre requerido, nunca ausente)', () => {
    expect(tableMatch![0]).toMatch(/paid_at\s+TIMESTAMPTZ\s+NOT NULL/);
  });
});

describe('wa_order_payments — idempotencia', () => {
  it('UNIQUE parcial (provider, provider_payment_id) WHERE provider_payment_id IS NOT NULL', () => {
    expect(migrationSource).toMatch(
      /CREATE UNIQUE INDEX wa_order_payments_provider_payment_id_unique\s*\n\s*ON public\.wa_order_payments\(provider, provider_payment_id\)\s*\n\s*WHERE provider_payment_id IS NOT NULL;/,
    );
  });
});

describe('wa_order_payments — RLS: SELECT solo del dueño, cero escritura directa', () => {
  it('RLS habilitado', () => {
    expect(migrationSource).toMatch(/ALTER TABLE public\.wa_order_payments ENABLE ROW LEVEL SECURITY/);
  });

  it('revoca todo de PUBLIC/anon/authenticated antes de otorgar el mínimo', () => {
    expect(migrationSource).toMatch(/REVOKE ALL ON TABLE public\.wa_order_payments FROM PUBLIC, anon, authenticated/);
  });

  it('otorga EXCLUSIVAMENTE SELECT a authenticated -- nunca INSERT/UPDATE/DELETE', () => {
    expect(migrationSource).toMatch(/GRANT SELECT ON TABLE public\.wa_order_payments TO authenticated;/);
    expect(migrationSource).not.toMatch(/GRANT[^;]*\b(INSERT|UPDATE|DELETE)\b[^;]*ON TABLE public\.wa_order_payments/);
  });

  it('existe una policy de SELECT scoped al dueño del negocio', () => {
    expect(migrationSource).toMatch(
      /CREATE POLICY "wa_order_payments_owner_select"\s*\n\s*ON public\.wa_order_payments FOR SELECT TO authenticated\s*\n\s*USING \(business_id IN \(\s*\n\s*SELECT id FROM public\.wa_businesses WHERE user_id = auth\.uid\(\)\s*\n\s*\)\);/,
    );
  });

  it('no existe ninguna policy de INSERT/UPDATE/DELETE sobre wa_order_payments', () => {
    expect(migrationSource).not.toMatch(/CREATE POLICY[^;]*ON public\.wa_order_payments FOR (INSERT|UPDATE|DELETE)/);
  });
});

describe('wa_process_merchant_payment_event — firma extendida con p_paid_at', () => {
  it('elimina la firma anterior de 9 parámetros (con walinka_fee, sin paid_at) antes de recrear', () => {
    expect(migrationSource).toMatch(
      /DROP FUNCTION IF EXISTS public\.wa_process_merchant_payment_event\(\s*\n\s*UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, NUMERIC\s*\n\);/,
    );
  });

  it('la nueva firma agrega p_paid_at TIMESTAMPTZ como décimo parámetro, sin DEFAULT (requerido)', () => {
    const fnMatch = migrationSource.match(/CREATE OR REPLACE FUNCTION public\.wa_process_merchant_payment_event\(([\s\S]*?)\)\nRETURNS/);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![1]).toMatch(/p_paid_at\s+TIMESTAMPTZ\s*$/m);
    expect(fnMatch![1]).not.toMatch(/p_paid_at\s+TIMESTAMPTZ\s+DEFAULT/);
  });

  it('p_paid_at es validado como requerido junto al resto de parámetros obligatorios', () => {
    expect(migrationSource).toMatch(/OR p_walinka_fee IS NULL OR p_paid_at IS NULL\s*\n\s*THEN\s*\n\s*RAISE EXCEPTION 'MISSING_REQUIRED_PARAMETER'/);
  });

  it('revoca todo acceso con la nueva firma de 10 parámetros', () => {
    expect(migrationSource).toMatch(
      /REVOKE ALL ON FUNCTION public\.wa_process_merchant_payment_event\(\s*\n\s*UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, NUMERIC, TIMESTAMPTZ\s*\n\)\s*FROM PUBLIC, anon, authenticated/,
    );
  });

  it('no existe ningún GRANT EXECUTE a authenticated ni anon', () => {
    expect(migrationSource).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.wa_process_merchant_payment_event[^;]*TO (authenticated|anon)/);
  });

  it('otorga EXECUTE explícitamente a service_role (endurecido, no depende del default de plataforma)', () => {
    expect(migrationSource).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.wa_process_merchant_payment_event\(\s*\n\s*UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, NUMERIC, TIMESTAMPTZ\s*\n\)\s*TO service_role;/,
    );
  });

  it('el GRANT a service_role viene DESPUÉS del REVOKE ALL (nunca antes -- sin ventana donde el REVOKE pudiera pisar el GRANT)', () => {
    const revokeIdx = migrationSource.indexOf('REVOKE ALL ON FUNCTION public.wa_process_merchant_payment_event');
    const grantIdx = migrationSource.indexOf('GRANT EXECUTE ON FUNCTION public.wa_process_merchant_payment_event');
    expect(revokeIdx).toBeGreaterThan(-1);
    expect(grantIdx).toBeGreaterThan(-1);
    expect(revokeIdx).toBeLessThan(grantIdx);
  });
});

describe('wa_process_merchant_payment_event — wa_order_payments escrito atómicamente, sin debilitar invariantes existentes', () => {
  it('el INSERT en wa_order_payments está DENTRO del bloque approved, DESPUÉS del gate de stock_applied_at y DESPUÉS de aplicar stock', () => {
    const forUpdateIdx = migrationSource.indexOf('FOR UPDATE');
    const approvedIdx = migrationSource.indexOf("IF p_mp_status = 'approved' THEN");
    const stockInsertIdx = migrationSource.indexOf('INSERT INTO public.crm_stock_movements');
    const stockAppliedIdx = migrationSource.indexOf('SET stock_applied_at = now()');
    const orderPaymentsInsertIdx = migrationSource.indexOf('INSERT INTO public.wa_order_payments (\n      business_id, order_id, provider, method, provider_payment_id,');
    const appliedNowIdx = migrationSource.indexOf('v_applied_now := true;');
    expect(forUpdateIdx).toBeGreaterThan(-1);
    expect(approvedIdx).toBeGreaterThan(-1);
    expect(stockInsertIdx).toBeGreaterThan(-1);
    expect(stockAppliedIdx).toBeGreaterThan(-1);
    expect(orderPaymentsInsertIdx).toBeGreaterThan(-1);
    expect(appliedNowIdx).toBeGreaterThan(-1);
    expect(forUpdateIdx).toBeLessThan(approvedIdx);
    expect(approvedIdx).toBeLessThan(stockInsertIdx);
    expect(stockInsertIdx).toBeLessThan(stockAppliedIdx);
    expect(stockAppliedIdx).toBeLessThan(orderPaymentsInsertIdx);
    expect(orderPaymentsInsertIdx).toBeLessThan(appliedNowIdx);
  });

  it('provider=mercado_pago, method=checkout_pro, provider_payment_id=p_mp_payment_id, status=confirmed', () => {
    const insertMatch = migrationSource.match(/INSERT INTO public\.wa_order_payments \([\s\S]*?\)\s*VALUES \([\s\S]*?\)\s*\n\s*ON CONFLICT/);
    expect(insertMatch).not.toBeNull();
    expect(insertMatch![0]).toMatch(/'mercado_pago', 'checkout_pro', p_mp_payment_id/);
    expect(insertMatch![0]).toMatch(/'confirmed', p_amount, p_currency, p_walinka_fee, NULL, NULL/);
  });

  it('mp_fee y net_amount se insertan como NULL -- nunca inventados', () => {
    const insertMatch = migrationSource.match(/INSERT INTO public\.wa_order_payments \([\s\S]*?\)\s*VALUES \([\s\S]*?\)\s*\n\s*ON CONFLICT/);
    expect(insertMatch![0]).toMatch(/NULL, NULL,\s*\n\s*NULL, NULL, p_paid_at, NULL, NULL/);
  });

  it('el INSERT tiene ON CONFLICT DO NOTHING sobre el mismo índice parcial -- defensa adicional, nunca duplica', () => {
    expect(migrationSource).toMatch(
      /ON CONFLICT \(provider, provider_payment_id\) WHERE provider_payment_id IS NOT NULL DO NOTHING;/,
    );
  });

  it('nunca aplica side-effects (ni toca wa_order_payments) si stock_applied_at ya está seteado -- gate de "no doble pago"', () => {
    const gateMatch = migrationSource.match(/IF FOUND AND v_existing\.stock_applied_at IS NOT NULL THEN\s*\n[\s\S]*?RETURN;\s*\n\s*END IF;/);
    expect(gateMatch).not.toBeNull();
    expect(gateMatch![0]).not.toMatch(/wa_order_payments/);
    expect(gateMatch![0]).not.toMatch(/INSERT INTO public\.crm_stock_movements/);
  });

  it('sigue lockeando la fila existente (SELECT...FOR UPDATE) ANTES de cualquier side-effect', () => {
    const forUpdateIdx = migrationSource.indexOf('FOR UPDATE');
    const updateOrdersIdx = migrationSource.indexOf("UPDATE public.wa_orders\n       SET payment_status = 'pagado'");
    expect(forUpdateIdx).toBeGreaterThan(-1);
    expect(updateOrdersIdx).toBeGreaterThan(-1);
    expect(forUpdateIdx).toBeLessThan(updateOrdersIdx);
  });

  it('rejected/cancelled nunca revierten un pedido ya pagado (invariante intacta)', () => {
    expect(migrationSource).toMatch(/WHERE id = p_order_id AND payment_status = 'pendiente'/);
  });

  it('valida amount/currency contra wa_orders como defensa en profundidad antes de marcar pagado (invariante intacta)', () => {
    expect(migrationSource).toMatch(/AMOUNT_CURRENCY_MISMATCH/);
    const mismatchIdx = migrationSource.indexOf('AMOUNT_CURRENCY_MISMATCH');
    const updatePagadoIdx = migrationSource.indexOf("SET payment_status = 'pagado'");
    expect(mismatchIdx).toBeLessThan(updatePagadoIdx);
  });

  it('filtra explícitamente por stock_actual IS NOT NULL antes de insertar movimientos de stock (invariante intacta)', () => {
    expect(migrationSource).toMatch(/AND p\.stock_actual IS NOT NULL/);
  });

  it('nunca hace UPDATE directo de wa_products.stock_actual (invariante intacta)', () => {
    expect(migrationSource).not.toMatch(/UPDATE public\.wa_products/);
  });
});

describe('wa_register_manual_order_payment — RPC de pagos manuales', () => {
  const fnMatch = migrationSource.match(/CREATE OR REPLACE FUNCTION public\.wa_register_manual_order_payment[\s\S]*?\nEND;\n\$\$;/);

  it('la función existe', () => {
    expect(fnMatch).not.toBeNull();
  });

  it('requiere auth.uid() -- NOT_AUTHENTICATED si no hay sesión', () => {
    expect(fnMatch![0]).toMatch(/v_user_id\s+UUID := auth\.uid\(\)/);
    expect(fnMatch![0]).toMatch(/IF v_user_id IS NULL THEN\s*\n\s*RAISE EXCEPTION 'NOT_AUTHENTICATED'/);
  });

  it('rechaza method fuera de cash|bank_transfer|other -- INVALID_PAYMENT_METHOD', () => {
    expect(fnMatch![0]).toMatch(/IF p_method NOT IN \('cash', 'bank_transfer', 'other'\) THEN/);
    expect(fnMatch![0]).toMatch(/RAISE EXCEPTION 'INVALID_PAYMENT_METHOD'/);
  });

  it('no acepta business_id como parámetro -- ownership deriva 100% de auth.uid() + JOIN a wa_businesses', () => {
    const sigMatch = migrationSource.match(/CREATE OR REPLACE FUNCTION public\.wa_register_manual_order_payment\(([\s\S]*?)\)\nRETURNS/);
    expect(sigMatch).not.toBeNull();
    expect(sigMatch![1]).not.toMatch(/business_id/);
    expect(fnMatch![0]).toMatch(/JOIN public\.wa_businesses b ON b\.id = o\.business_id\s*\n\s*WHERE o\.id = p_order_id\s*\n\s*AND b\.user_id = v_user_id/);
  });

  it('pedido inexistente o de otro negocio -- ORDER_NOT_FOUND_OR_NOT_OWNED', () => {
    expect(fnMatch![0]).toMatch(/IF NOT FOUND THEN\s*\n\s*RAISE EXCEPTION 'ORDER_NOT_FOUND_OR_NOT_OWNED'/);
  });

  it('rechaza un segundo registro sobre un pedido ya pagado -- ORDER_ALREADY_PAID', () => {
    expect(fnMatch![0]).toMatch(/IF v_order\.payment_status = 'pagado' THEN\s*\n\s*RAISE EXCEPTION 'ORDER_ALREADY_PAID'/);
  });

  it('exige monto EXACTO contra wa_orders.total_amount -- AMOUNT_MISMATCH', () => {
    expect(fnMatch![0]).toMatch(/IF p_amount <> v_order\.total_amount THEN\s*\n\s*RAISE EXCEPTION 'AMOUNT_MISMATCH'/);
  });

  it('exige currency EXACTA contra wa_orders.currency -- CURRENCY_MISMATCH', () => {
    expect(fnMatch![0]).toMatch(/IF p_currency <> v_order\.currency THEN\s*\n\s*RAISE EXCEPTION 'CURRENCY_MISMATCH'/);
  });

  it('inserta provider=manual, walinka_fee=0, registered_by=v_user_id (auth.uid())', () => {
    expect(fnMatch![0]).toMatch(/'manual', p_method, NULL,\s*\n\s*'confirmed', p_amount, p_currency, 0, NULL, NULL,\s*\n\s*NULL, NULL, now\(\), v_user_id/);
  });

  it('actualiza wa_orders.payment_status=pagado + paid_at en la MISMA función (misma transacción, no 2 pasos)', () => {
    expect(fnMatch![0]).toMatch(/UPDATE public\.wa_orders\s*\n\s*SET payment_status = 'pagado',\s*\n\s*paid_at\s*=\s*now\(\)/);
  });

  it('revoca todo de PUBLIC/anon/authenticated antes de otorgar el mínimo explícito', () => {
    expect(migrationSource).toMatch(
      /REVOKE ALL ON FUNCTION public\.wa_register_manual_order_payment\(UUID, TEXT, NUMERIC, TEXT, TEXT\) FROM PUBLIC, anon, authenticated;/,
    );
  });

  it('otorga EXECUTE a authenticated (después del REVOKE) -- único rol cliente permitido', () => {
    expect(migrationSource).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.wa_register_manual_order_payment\(UUID, TEXT, NUMERIC, TEXT, TEXT\) TO authenticated;/,
    );
    const revokeIdx = migrationSource.indexOf('REVOKE ALL ON FUNCTION public.wa_register_manual_order_payment');
    const grantAuthIdx = migrationSource.indexOf('GRANT EXECUTE ON FUNCTION public.wa_register_manual_order_payment(UUID, TEXT, NUMERIC, TEXT, TEXT) TO authenticated;');
    expect(revokeIdx).toBeGreaterThan(-1);
    expect(grantAuthIdx).toBeGreaterThan(-1);
    expect(revokeIdx).toBeLessThan(grantAuthIdx);
  });

  it('otorga EXECUTE explícitamente a service_role también (endurecido, no depende del default de plataforma)', () => {
    expect(migrationSource).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.wa_register_manual_order_payment\(UUID, TEXT, NUMERIC, TEXT, TEXT\) TO service_role;/,
    );
  });

  it('nunca otorga EXECUTE a anon (ni explícita ni implícitamente vía PUBLIC)', () => {
    expect(migrationSource).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.wa_register_manual_order_payment[^;]*TO anon/);
  });
});

describe('Backfill — pagos Mercado Pago ya confirmados', () => {
  const backfillMatch = migrationSource.match(/INSERT INTO public\.wa_order_payments \([\s\S]*?\)\s*\nSELECT[\s\S]*?ON CONFLICT \(provider, provider_payment_id\) WHERE provider_payment_id IS NOT NULL DO NOTHING;/);

  it('el backfill existe y selecciona desde wa_merchant_payment_events', () => {
    expect(backfillMatch).not.toBeNull();
    expect(backfillMatch![0]).toMatch(/FROM public\.wa_merchant_payment_events e/);
  });

  it('solo incluye eventos con stock_applied_at IS NOT NULL (realmente aplicados)', () => {
    expect(backfillMatch![0]).toMatch(/WHERE e\.stock_applied_at IS NOT NULL/);
  });

  it('method=checkout_pro hardcodeado con evidencia estructural documentada en el comentario de cabecera', () => {
    expect(backfillMatch![0]).toMatch(/'mercado_pago',\s*\n\s*'checkout_pro',/);
    expect(migrationSource).toMatch(/evidencia[\s\S]{0,10}estructural, no una suposición/);
  });

  it('payer_name/payer_email/mp_fee/net_amount se insertan como NULL -- nunca inventados', () => {
    const selectPart = backfillMatch![0];
    // Tras walinka_fee vienen mp_fee, net_amount, payer_name, payer_email como NULL literales.
    expect(selectPart).toMatch(/e\.walinka_fee,\s*\n\s*NULL,\s*\n\s*NULL,\s*\n\s*NULL,\s*\n\s*NULL,\s*\n\s*e\.stock_applied_at,\s*\n\s*NULL,/);
  });

  it('paid_at usa stock_applied_at (documentado como proxy, no date_approved de MP)', () => {
    expect(backfillMatch![0]).toMatch(/e\.stock_applied_at,/);
    expect(migrationSource).toMatch(/paid_at = stock_applied_at/);
  });

  it('es idempotente: ON CONFLICT DO NOTHING sobre el mismo índice parcial de negocio/provider_payment_id', () => {
    expect(backfillMatch![0]).toMatch(/ON CONFLICT \(provider, provider_payment_id\) WHERE provider_payment_id IS NOT NULL DO NOTHING;/);
  });

  it('respeta business_id/order_id/mp_payment_id/amount/currency/walinka_fee existentes de wa_merchant_payment_events (columnas e.* reusadas, no recalculadas)', () => {
    expect(backfillMatch![0]).toMatch(/e\.business_id,/);
    expect(backfillMatch![0]).toMatch(/e\.order_id,/);
    expect(backfillMatch![0]).toMatch(/e\.mp_payment_id,/);
    expect(backfillMatch![0]).toMatch(/e\.amount,/);
    expect(backfillMatch![0]).toMatch(/e\.currency,/);
    expect(backfillMatch![0]).toMatch(/e\.walinka_fee,/);
  });
});

describe('no toca billing/OAuth/crm_payments', () => {
  it('no contiene SQL real sobre wa_payments, wa_payment_events, billing_subscriptions, mp_connections ni crm_payments', () => {
    expect(migrationSource).not.toMatch(
      /(INSERT INTO|UPDATE|SELECT[^;]*FROM|REFERENCES)\s+public\.(wa_payments|wa_payment_events|billing_subscriptions|mp_connections|crm_payments)\b/i,
    );
  });
});
