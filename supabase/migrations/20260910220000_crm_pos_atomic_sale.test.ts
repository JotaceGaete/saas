/**
 * 20260910220000_crm_pos_atomic_sale.sql — tests estáticos (source-scan)
 * de la RPC atómica de venta POS. No hay entorno Postgres en Vitest --
 * mismo criterio que el resto de las migraciones de este repo.
 *
 * LIMITACIÓN EXPLÍCITA (pedida en TPV-CORE-1, sección 12): estos tests
 * NO pueden probar comportamiento real de concurrencia SQL (dos
 * transacciones Postgres genuinamente simultáneas, locks, bloqueo real
 * de una fila). Lo que sí prueban, con certeza, es que el MECANISMO
 * correcto está en el código fuente de la función: el SELECT bajo
 * FOR UPDATE existe, en el lugar correcto, antes del INSERT que
 * dispararía el trigger, y que STOCK_INSUFFICIENT se evalúa contra un
 * valor leído bajo ese lock. La garantía de que esto efectivamente
 * serializa dos transacciones reales solo puede confirmarse contra un
 * Postgres real (staging/producción), no en esta suite.
 */
import { describe, it, expect } from 'vitest';
import migrationSource from './20260910220000_crm_pos_atomic_sale.sql?raw';

const posSaleFnMatch = migrationSource.match(
  /CREATE OR REPLACE FUNCTION public\.crm_create_pos_sale\([\s\S]*?\$\$;/,
);
const triggerFnMatch = migrationSource.match(
  /CREATE OR REPLACE FUNCTION public\.crm_apply_stock_movement\(\)[\s\S]*?\$\$;/,
);

describe('20260910220000 — no toca lo que está fuera de alcance', () => {
  it('no modifica wa_orders, wa_order_items, wa_process_merchant_payment_event, crm_create_invoice_document ni crm_update_invoice_document', () => {
    expect(migrationSource).not.toMatch(/ALTER TABLE public\.wa_orders/);
    expect(migrationSource).not.toMatch(/ALTER TABLE public\.wa_order_items/);
    expect(migrationSource).not.toMatch(/CREATE OR REPLACE FUNCTION public\.wa_process_merchant_payment_event/);
    expect(migrationSource).not.toMatch(/CREATE OR REPLACE FUNCTION public\.crm_create_invoice_document/);
    expect(migrationSource).not.toMatch(/CREATE OR REPLACE FUNCTION public\.crm_update_invoice_document/);
  });

  it('ambas funciones existen', () => {
    expect(posSaleFnMatch).not.toBeNull();
    expect(triggerFnMatch).not.toBeNull();
  });
});

describe('pos_idempotency_key — modelo del índice', () => {
  it('columna nullable en crm_invoices, sin default', () => {
    expect(migrationSource).toMatch(/ADD COLUMN IF NOT EXISTS pos_idempotency_key TEXT NULL;/);
  });

  it('índice único parcial incluye business_id (decisión explícita, distinta de crm_invoices_order_id_uq)', () => {
    expect(migrationSource).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS crm_invoices_pos_idempotency_key_uq\s*\n\s*ON public\.crm_invoices \(business_id, pos_idempotency_key\)\s*\n\s*WHERE pos_idempotency_key IS NOT NULL;/,
    );
  });
});

describe('Validación de p_idempotency_key -- una key inválida nunca debe desactivar la protección de idempotencia en silencio', () => {
  it('rechaza NULL, string vacío y whitespace-only, en el mismo IF de parámetros requeridos', () => {
    expect(posSaleFnMatch[0]).toMatch(
      /IF p_business_id IS NULL OR p_idempotency_key IS NULL OR btrim\(p_idempotency_key\) = ''/,
    );
  });

  it('rechaza longitud absurda (> 200 caracteres) en el mismo IF -- nunca se acepta silenciosamente', () => {
    expect(posSaleFnMatch[0]).toMatch(/OR length\(p_idempotency_key\) > 200/);
  });

  it('la validación de key ocurre ANTES del advisory lock -- nunca se toma un lock con una key inválida', () => {
    const validationIdx = posSaleFnMatch[0].indexOf("RAISE EXCEPTION 'MISSING_REQUIRED_PARAMETER'");
    const lockIdx = posSaleFnMatch[0].indexOf('PERFORM pg_advisory_xact_lock(');
    expect(validationIdx).toBeGreaterThan(-1);
    expect(lockIdx).toBeGreaterThan(-1);
    expect(validationIdx).toBeLessThan(lockIdx);
  });
});

describe('TPV-CORE-1B — advisory lock serializa por (business_id, pos_idempotency_key)', () => {
  it('existe un pg_advisory_xact_lock (transaction-level, se libera solo al commit/rollback -- nunca pg_advisory_lock de sesión)', () => {
    expect(posSaleFnMatch[0]).toMatch(/PERFORM pg_advisory_xact_lock\(/);
    expect(posSaleFnMatch[0]).not.toMatch(/pg_advisory_lock\(/); // el de sesión, sin _xact_, no debe aparecer
  });

  it('la clave del lock se deriva de business_id + idempotency_key vía hashtextextended -- determinística, no un lock global', () => {
    expect(posSaleFnMatch[0]).toMatch(
      /PERFORM pg_advisory_xact_lock\(hashtextextended\(p_business_id::text \|\| ':' \|\| p_idempotency_key, 0\)\);/,
    );
  });

  it('el lock ocurre DESPUÉS de validar ownership y ANTES del SELECT de idempotencia', () => {
    const ownershipIdx = posSaleFnMatch[0].indexOf("RAISE EXCEPTION 'Business not accessible'");
    const lockIdx = posSaleFnMatch[0].indexOf('PERFORM pg_advisory_xact_lock(');
    const idempotencyCheckIdx = posSaleFnMatch[0].indexOf('SELECT * INTO v_existing_invoice');
    expect(ownershipIdx).toBeGreaterThan(-1);
    expect(lockIdx).toBeGreaterThan(-1);
    expect(idempotencyCheckIdx).toBeGreaterThan(-1);
    expect(ownershipIdx).toBeLessThan(lockIdx);
    expect(lockIdx).toBeLessThan(idempotencyCheckIdx);
  });

  it('el SELECT de idempotencia ocurre ANTES de cualquier lock/validación de stock (FOR UPDATE sobre wa_products)', () => {
    const idempotencyCheckIdx = posSaleFnMatch[0].indexOf('SELECT * INTO v_existing_invoice');
    const stockLockIdx = posSaleFnMatch[0].indexOf('SELECT stock_actual INTO v_stock_actual');
    expect(idempotencyCheckIdx).toBeGreaterThan(-1);
    expect(stockLockIdx).toBeGreaterThan(-1);
    expect(idempotencyCheckIdx).toBeLessThan(stockLockIdx);
  });

  it('no atrapa unique_violation (23505) de crm_invoices_pos_idempotency_key_uq -- decisión explícita, documentada, para no esconder un bug real si el lock alguna vez fallara', () => {
    expect(posSaleFnMatch[0]).not.toMatch(/WHEN unique_violation/i);
    expect(posSaleFnMatch[0]).not.toMatch(/EXCEPTION\s+WHEN/i);
    expect(migrationSource).toMatch(/decisión sobre unique_violation \(23505\)/);
  });

  it('LIMITACIÓN EXPLÍCITA: esta suite no ejecuta dos transacciones Postgres concurrentes reales -- confirma que el lock existe y está en el orden correcto, no que efectivamente serializa contra un Postgres real', () => {
    expect(true).toBe(true);
  });
});

describe('Idempotencia (escenarios 8, 9, 10 — retry no duplica invoice/payment/stock)', () => {
  it('tras el lock, la función busca una invoice existente ANTES de cualquier INSERT', () => {
    const idempotencyCheckIdx = posSaleFnMatch[0].indexOf('SELECT * INTO v_existing_invoice');
    const firstInsertIdx = posSaleFnMatch[0].indexOf('INSERT INTO public.crm_invoices');
    expect(idempotencyCheckIdx).toBeGreaterThan(-1);
    expect(firstInsertIdx).toBeGreaterThan(-1);
    expect(idempotencyCheckIdx).toBeLessThan(firstInsertIdx);
  });

  it('si ya existe, retorna esa fila y NO ejecuta ningún INSERT (RETURN corta el flujo antes de crear nada, antes incluso de validar cliente/items/stock)', () => {
    const block = posSaleFnMatch[0].slice(
      posSaleFnMatch[0].indexOf('SELECT * INTO v_existing_invoice'),
      posSaleFnMatch[0].indexOf('IF p_customer_id IS NOT NULL'),
    );
    expect(block).toMatch(/IF FOUND THEN\s*\n\s*RETURN NEXT v_existing_invoice;\s*\n\s*RETURN;\s*\n\s*END IF;/);
  });

  it('la búsqueda de idempotencia está acotada a business_id + pos_idempotency_key, igual que el índice único', () => {
    expect(posSaleFnMatch[0]).toMatch(
      /WHERE business_id = p_business_id AND pos_idempotency_key = p_idempotency_key;/,
    );
  });
});

describe('Concurrencia (escenario 11) — mecanismo presente, NO probado end-to-end', () => {
  it('el trigger crm_apply_stock_movement usa FOR UPDATE en el SELECT de stock_actual', () => {
    expect(triggerFnMatch[0]).toMatch(
      /SELECT stock_actual\s*\n\s*INTO v_stock_actual\s*\n\s*FROM public\.wa_products\s*\n\s*WHERE id\s*=\s*NEW\.product_id\s*\n\s*AND business_id = NEW\.business_id\s*\n\s*FOR UPDATE;/,
    );
  });

  it('crm_create_pos_sale bloquea la fila de wa_products (FOR UPDATE) ANTES de comparar contra la cantidad pedida', () => {
    const lockIdx = posSaleFnMatch[0].indexOf('FOR UPDATE;\n\n    IF NOT FOUND THEN');
    const compareIdx = posSaleFnMatch[0].indexOf('IF v_stock_actual IS NOT NULL AND v_stock_actual < v_agg.total_qty THEN');
    expect(lockIdx).toBeGreaterThan(-1);
    expect(compareIdx).toBeGreaterThan(-1);
    expect(lockIdx).toBeLessThan(compareIdx);
  });

  it('la validación de stock ocurre ANTES de cualquier INSERT (invoice/items/payments/stock) -- aborta limpio, no a mitad de camino', () => {
    const stockCheckIdx = posSaleFnMatch[0].indexOf('STOCK_INSUFFICIENT');
    const firstInsertIdx = posSaleFnMatch[0].indexOf('INSERT INTO public.crm_invoices');
    expect(stockCheckIdx).toBeGreaterThan(-1);
    expect(firstInsertIdx).toBeGreaterThan(-1);
    expect(stockCheckIdx).toBeLessThan(firstInsertIdx);
  });

  it('LIMITACIÓN EXPLÍCITA: esta suite no ejecuta dos transacciones Postgres concurrentes reales -- no hay entorno Postgres en Vitest. Esto confirma el mecanismo (lock + orden de validación), no el resultado bajo concurrencia real', () => {
    expect(true).toBe(true);
  });
});

describe('Validación de items y stock (escenarios 4, 5, 6, 7)', () => {
  it('líneas sin product_id (manuales/freeform) quedan excluidas de la agregación de stock por el WHERE NULLIF(...) IS NOT NULL', () => {
    const occurrences = posSaleFnMatch[0].match(/WHERE NULLIF\(line->>'product_id', ''\) IS NOT NULL/g) || [];
    expect(occurrences.length).toBe(2); // una vez para validar/bloquear, otra vez para insertar movimientos
  });

  it('agrega cantidades por product_id (GROUP BY) antes de comparar contra stock -- evita que dos líneas del mismo producto pasen individualmente', () => {
    expect(posSaleFnMatch[0]).toMatch(/SUM\(COALESCE\(\(line->>'quantity'\)::INTEGER, 0\)\) AS total_qty[\s\S]*?GROUP BY 1/);
  });

  it('producto con stock_actual IS NULL nunca se valida ni bloquea la venta (control de stock desactivado)', () => {
    expect(posSaleFnMatch[0]).toMatch(/IF v_stock_actual IS NOT NULL AND v_stock_actual < v_agg\.total_qty THEN/);
  });

  it('producto inexistente o de otro negocio (mismo código, no distingue) aborta con PRODUCT_NOT_FOUND', () => {
    expect(posSaleFnMatch[0]).toMatch(
      /FROM public\.wa_products\s*\n\s*WHERE id = v_agg\.product_id AND business_id = p_business_id\s*\n\s*FOR UPDATE;\s*\n\s*\n\s*IF NOT FOUND THEN[\s\S]*?RAISE EXCEPTION 'PRODUCT_NOT_FOUND'/,
    );
  });

  it('stock insuficiente lanza STOCK_INSUFFICIENT', () => {
    expect(posSaleFnMatch[0]).toMatch(/RAISE EXCEPTION 'STOCK_INSUFFICIENT' USING ERRCODE = 'P0001';/);
  });
});

describe('Stock — momento y alcance del descuento (escenarios 1, 2, 3)', () => {
  it('el INSERT de crm_stock_movements no está condicionado por v_invoice_status -- se ejecuta igual para pagada/parcial/pendiente', () => {
    const stockInsertBlock = posSaleFnMatch[0].slice(posSaleFnMatch[0].lastIndexOf('-- Stock: una fila por producto'));
    expect(stockInsertBlock).not.toMatch(/IF v_invoice_status/);
    expect(stockInsertBlock).toMatch(/INSERT INTO public\.crm_stock_movements/);
  });

  it('el filtro final del INSERT exige stock_actual IS NOT NULL -- nunca activa control de stock involuntariamente', () => {
    expect(posSaleFnMatch[0]).toMatch(/AND p\.stock_actual IS NOT NULL;/);
  });

  it('type=salida, cantidad agregada, con nota trazable a la invoice (número + id)', () => {
    expect(posSaleFnMatch[0]).toMatch(
      /SELECT p_business_id, v_agg\.product_id, 'salida', v_agg\.total_qty,\s*\n\s*'Venta TPV -- ' \|\| v_number_label \|\| ' \(invoice ' \|\| v_invoice\.id \|\| '\)', v_user_id/,
    );
  });

  it('nunca hace UPDATE directo de wa_products.stock_actual desde la RPC -- solo INSERT en crm_stock_movements (el trigger aplica el delta)', () => {
    const rpcOnly = posSaleFnMatch[0];
    expect(rpcOnly).not.toMatch(/UPDATE public\.wa_products/);
  });
});

describe('Estados de venta (escenario 13) — misma semántica que hoy', () => {
  it('pagada/parcial/pendiente calculado igual que la lógica JS actual (paidTotal>=total / >0 / si no)', () => {
    expect(posSaleFnMatch[0]).toMatch(
      /v_invoice_status := CASE\s*\n\s*WHEN v_paid_total >= v_total THEN 'pagada'\s*\n\s*WHEN v_paid_total > 0 THEN 'parcial'\s*\n\s*ELSE 'pendiente'\s*\n\s*END;/,
    );
  });

  it('paid_at solo se fija cuando queda pagada', () => {
    expect(posSaleFnMatch[0]).toMatch(/v_paid_at := CASE WHEN v_invoice_status = 'pagada' THEN now\(\) ELSE NULL END;/);
  });

  it('saldo pendiente sin cliente aborta con CREDIT_NO_CUSTOMER -- misma regla de hoy', () => {
    expect(posSaleFnMatch[0]).toMatch(
      /IF v_paid_total < v_total AND p_customer_id IS NULL THEN\s*\n\s*RAISE EXCEPTION 'CREDIT_NO_CUSTOMER'/,
    );
  });
});

describe('Pagos y caja (escenarios 14, 15 — multi-tender y vuelto)', () => {
  it('valida cada método contra la lista real permitida (cash/card/bank_transfer/check/other)', () => {
    expect(posSaleFnMatch[0]).toMatch(
      /IF v_method NOT IN \('cash', 'card', 'bank_transfer', 'check', 'other'\) THEN/,
    );
  });

  it('rechaza no-efectivo que supere el total -- "solo el efectivo puede generar vuelto"', () => {
    expect(posSaleFnMatch[0]).toMatch(/IF v_non_cash_total > v_total THEN\s*\n\s*RAISE EXCEPTION 'INVALID_PAYMENT'/);
  });

  it('aplica efectivo hasta el remanente (LEAST) -- mismo algoritmo de tope que createPosInvoice tenía en JS', () => {
    const occurrences = posSaleFnMatch[0].match(/v_applied_amount := LEAST\(v_amount, v_remaining_for_cash\);/g) || [];
    expect(occurrences.length).toBe(2); // una vez para calcular paid_total, otra para insertar los pagos reales
  });

  it('caja abierta requerida SOLO si hay pago real aplicado (paid_total > 0) -- cuenta corriente pura no la exige', () => {
    expect(posSaleFnMatch[0]).toMatch(/IF v_paid_total > 0 THEN\s*\n\s*SELECT id INTO v_open_session_id/);
  });

  it('el lock de la sesión de caja también usa FOR UPDATE', () => {
    expect(posSaleFnMatch[0]).toMatch(
      /FROM public\.crm_cash_sessions\s*\n\s*WHERE business_id = p_business_id AND status = 'open'\s*\n\s*ORDER BY opened_at DESC\s*\n\s*LIMIT 1\s*\n\s*FOR UPDATE;/,
    );
  });

  it('nunca inserta en crm_cash_movements -- esa tabla sigue siendo solo para movimientos manuales', () => {
    expect(posSaleFnMatch[0]).not.toMatch(/crm_cash_movements/);
  });
});

describe('Seguridad', () => {
  it('SECURITY DEFINER + search_path fijo en ambas funciones', () => {
    expect(posSaleFnMatch[0]).toMatch(/SECURITY DEFINER/);
    expect(posSaleFnMatch[0]).toMatch(/SET search_path = public/);
    expect(triggerFnMatch[0]).toMatch(/SECURITY DEFINER/);
  });

  it('ownership verificado server-side contra auth.uid() -- nunca confía en p_business_id del cliente', () => {
    expect(posSaleFnMatch[0]).toMatch(
      /IF NOT EXISTS \(\s*\n\s*SELECT 1 FROM public\.wa_businesses WHERE id = p_business_id AND user_id = v_user_id\s*\n\s*\) THEN/,
    );
  });

  it('REVOKE ALL FROM PUBLIC + GRANT EXECUTE únicamente a authenticated', () => {
    expect(migrationSource).toMatch(
      /REVOKE ALL ON FUNCTION public\.crm_create_pos_sale\(UUID, TEXT, JSONB, DATE, UUID, NUMERIC, JSONB, TEXT, TEXT\) FROM PUBLIC;/,
    );
    expect(migrationSource).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.crm_create_pos_sale\(UUID, TEXT, JSONB, DATE, UUID, NUMERIC, JSONB, TEXT, TEXT\) TO authenticated;/,
    );
    expect(migrationSource).not.toMatch(/GRANT[^;]*crm_create_pos_sale[^;]*TO (anon|PUBLIC)/);
  });
});
