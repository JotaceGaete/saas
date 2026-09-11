/**
 * 20260911010000_wa_supplier_invoices_core.sql — tests estáticos
 * (source-scan) del backend canónico de PROVEEDORES-CORE-2, incluida la
 * enmienda PROVEEDORES-CORE-2B (todo pago debe quedar completamente
 * asignado -- SUM(allocations) = payment.amount, sin anticipos/crédito a
 * favor en esta versión). Igual criterio que el resto de las migraciones
 * de este repo (`npx vitest run` no tiene Postgres disponible).
 *
 * LIMITACIÓN EXPLÍCITA, igual que en 20260910220000_crm_pos_atomic_sale.test.ts:
 * esta suite prueba que el MECANISMO correcto existe en el código fuente
 * (el FOR UPDATE en orden determinístico, las validaciones en el orden
 * correcto, las políticas RLS correctas). NO puede probar, dentro de
 * Vitest, que dos transacciones Postgres reales efectivamente se
 * serializan.
 *
 * Esa garantía de concurrencia SÍ se verificó en esta sesión, pero fuera
 * de esta suite: contra un Postgres 16 real y local (cluster ya instalado
 * en este entorno, sin ninguna relación con Supabase remoto/producción).
 * Se ejecutaron dos sesiones psql genuinamente concurrentes -- sesión A
 * abre una transacción, toma el lock FOR UPDATE sobre una factura vía
 * wa_register_supplier_payment y duerme 3s antes de comitear; sesión B,
 * lanzada 1s después, intenta asignar contra la MISMA factura. B quedó
 * bloqueada ~2s (el tiempo real restante del sleep de A, medido con
 * `date +%s.%N` en el shell) -- no fue una carrera ganada por suerte, fue
 * un bloqueo real y medido. Al desbloquearse, B recalculó el saldo ya
 * actualizado por A (post-commit) y fue rechazada con
 * ALLOCATION_EXCEEDS_BALANCE -- cero sobreasignación, cero pago huérfano
 * (se verificó que la excepción revirtió el INSERT completo del pago de
 * B, no solo sus allocations). Esa validación fue manual, ad hoc, contra
 * una base de datos descartable de este entorno -- no queda wireada en
 * ningún pipeline de CI porque este repo no tiene Postgres disponible en
 * `npx vitest run` ni en build. No se fingió una prueba SQL real en esta
 * suite: lo que sigue es honestamente source-scan.
 */
import { describe, it, expect } from 'vitest';
import migrationSource from './20260911010000_wa_supplier_invoices_core.sql?raw';

const rpcMatch = migrationSource.match(
  /CREATE OR REPLACE FUNCTION public\.wa_register_supplier_payment\([\s\S]*?\$\$;/,
);
const viewMatch = migrationSource.match(
  /CREATE OR REPLACE VIEW public\.wa_supplier_invoice_balances AS[\s\S]*?;/,
);

// El archivo tiene comentarios --  extensos explicando POR QUÉ se evitó tal
// o cual nombre/tabla (ej. "antes de nombrar la columna tax_id... se evitó")
// -- esos comentarios legítimamente mencionan los términos que los checks de
// "alcance" de abajo quieren confirmar ausentes del DDL real. Se compara
// contra el código con los comentarios de línea quitados, para no confundir
// "se explica por qué no se hizo" con "se hizo".
const codeOnly = migrationSource
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');

describe('PROVEEDORES-CORE-2 — alcance: no toca nada fuera de lo pedido', () => {
  it('no migra ni modifica wa_supplier_debts', () => {
    expect(migrationSource).not.toMatch(/ALTER TABLE (public\.)?wa_supplier_debts/i);
    expect(migrationSource).not.toMatch(/INSERT INTO (public\.)?wa_supplier_debts/i);
  });

  it('no toca crm_purchase_invoices (el nombre solo aparece en comentarios explicativos, nunca en DDL real)', () => {
    expect(codeOnly).not.toMatch(/crm_purchase_invoices/i);
  });

  it('no toca crm_cash_movements ni crm_cost_items (integración Caja/Gastos explícitamente diferida)', () => {
    expect(codeOnly).not.toMatch(/crm_cash_movements/i);
    expect(codeOnly).not.toMatch(/crm_cost_items/i);
  });

  it('no agrega columnas de adjuntos (fuera de alcance en esta fase)', () => {
    expect(codeOnly).not.toMatch(/attachment_/i);
    expect(codeOnly).not.toMatch(/receipt_/i);
  });

  it('no agrega funding_source/cash_session_id/cash_movement_id a wa_supplier_payments (CORE-2 sección 5, explícito)', () => {
    expect(codeOnly).not.toMatch(/funding_source/i);
    expect(codeOnly).not.toMatch(/cash_session_id/i);
    expect(codeOnly).not.toMatch(/cash_movement_id/i);
  });

  it('no agrega legacy_debt_id (CORE-2 sección 3: solo si hay razón técnica demostrada -- no la hubo)', () => {
    expect(codeOnly).not.toMatch(/legacy_debt_id/i);
  });
});

describe('wa_suppliers — extensión mínima', () => {
  it('agrega rut/legal_name/address como nullable, no tax_id (precedente encontrado: wa_customers.rut)', () => {
    expect(migrationSource).toMatch(/ADD COLUMN IF NOT EXISTS rut\s+TEXT,/);
    expect(migrationSource).toMatch(/ADD COLUMN IF NOT EXISTS legal_name TEXT,/);
    expect(migrationSource).toMatch(/ADD COLUMN IF NOT EXISTS address\s+TEXT;/);
    expect(codeOnly).not.toMatch(/tax_id/i);
  });

  it('índice único parcial (business_id, rut) WHERE rut IS NOT NULL -- nunca bloquea proveedores sin RUT', () => {
    expect(migrationSource).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS wa_suppliers_business_rut_uq\s*\n\s*ON public\.wa_suppliers \(business_id, rut\)\s*\n\s*WHERE rut IS NOT NULL;/,
    );
  });

  it('no toca datos existentes de wa_suppliers (sin UPDATE/DELETE sobre la tabla)', () => {
    expect(migrationSource).not.toMatch(/UPDATE (public\.)?wa_suppliers\s/i);
    expect(migrationSource).not.toMatch(/DELETE FROM (public\.)?wa_suppliers/i);
  });
});

describe('wa_supplier_invoices — entidad canónica', () => {
  it('todas las columnas pedidas en CORE-2 sección 3 están presentes', () => {
    const cols = [
      'id\\s+UUID PRIMARY KEY',
      'business_id\\s+UUID NOT NULL',
      'supplier_id\\s+UUID NOT NULL',
      'document_type\\s+TEXT NOT NULL',
      'document_number\\s+TEXT',
      'issue_date\\s+DATE NOT NULL DEFAULT CURRENT_DATE',
      'due_date\\s+DATE',
      'purchase_type\\s+TEXT',
      'net_amount\\s+NUMERIC\\(14,2\\) NOT NULL DEFAULT 0',
      'tax_rate\\s+NUMERIC\\(5,2\\)\\s+NOT NULL DEFAULT 0',
      'tax_amount\\s+NUMERIC\\(14,2\\) NOT NULL DEFAULT 0',
      'total_amount\\s+NUMERIC\\(14,2\\) NOT NULL CHECK',
      'notes\\s+TEXT',
      'created_at\\s+TIMESTAMPTZ NOT NULL DEFAULT now\\(\\)',
      'updated_at\\s+TIMESTAMPTZ NOT NULL DEFAULT now\\(\\)',
    ];
    for (const col of cols) {
      expect(migrationSource).toMatch(new RegExp(col));
    }
  });

  it('SIN status, SIN amount_paid, SIN balance almacenados -- todo se deriva por vista (CORE-1/CORE-2 explícito)', () => {
    const tableMatch = migrationSource.match(
      /CREATE TABLE IF NOT EXISTS public\.wa_supplier_invoices \([\s\S]*?\n\);/,
    );
    expect(tableMatch).not.toBeNull();
    expect(tableMatch[0]).not.toMatch(/\bstatus\s/);
    expect(tableMatch[0]).not.toMatch(/amount_paid/);
    expect(tableMatch[0]).not.toMatch(/\bbalance\s/);
    expect(tableMatch[0]).not.toMatch(/is_overdue/);
  });

  it('supplier_id → wa_suppliers ON DELETE RESTRICT (no CASCADE -- decisión deliberada, distinta de wa_supplier_debts)', () => {
    expect(migrationSource).toMatch(
      /supplier_id\s+UUID NOT NULL REFERENCES public\.wa_suppliers\(id\) ON DELETE RESTRICT,\n\n\s*document_type/,
    );
  });

  it('business_id → wa_businesses ON DELETE CASCADE', () => {
    expect(migrationSource).toMatch(
      /CREATE TABLE IF NOT EXISTS public\.wa_supplier_invoices[\s\S]*?business_id\s+UUID NOT NULL REFERENCES public\.wa_businesses\(id\) ON DELETE CASCADE,/,
    );
  });

  it('checks: total_amount/net_amount/tax_amount/tax_rate >= 0', () => {
    expect(migrationSource).toMatch(/total_amount\s+NUMERIC\(14,2\) NOT NULL CHECK \(total_amount >= 0\)/);
    expect(migrationSource).toMatch(/net_amount\s+NUMERIC\(14,2\) NOT NULL DEFAULT 0 CHECK \(net_amount >= 0\)/);
    expect(migrationSource).toMatch(/tax_amount\s+NUMERIC\(14,2\) NOT NULL DEFAULT 0 CHECK \(tax_amount >= 0\)/);
    expect(migrationSource).toMatch(/tax_rate\s+NUMERIC\(5,2\)\s+NOT NULL DEFAULT 0 CHECK \(tax_rate >= 0\)/);
  });

  it('document_type restringido a los 5 valores del diseño CORE-1 (incluye legacy_debt para la migración futura, y nota_credito para D)', () => {
    expect(migrationSource).toMatch(
      /document_type IN\s*\n\s*\('factura', 'boleta', 'nota_credito', 'legacy_debt', 'other'\)/,
    );
  });

  it('purchase_type conserva los valores de crm_purchase_invoices + los nuevos del diseño CORE-1', () => {
    expect(migrationSource).toMatch(
      /purchase_type IN\s*\n\s*\('mercaderia', 'gasto_con_iva', 'gasto_sin_iva', 'servicio', 'otros'\)/,
    );
  });

  it('unicidad documental incluye document_type (sección 4 CORE-2: NO solo business_id+supplier_id+document_number)', () => {
    expect(migrationSource).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS wa_supplier_invoices_doc_uq\s*\n\s*ON public\.wa_supplier_invoices \(business_id, supplier_id, document_type, document_number\)\s*\n\s*WHERE document_number IS NOT NULL;/,
    );
  });

  it('índices de negocio/proveedor/fecha de emisión/vencimiento', () => {
    expect(migrationSource).toMatch(/wa_supplier_invoices_business_id_idx\s*\n\s*ON public\.wa_supplier_invoices\(business_id\);/);
    expect(migrationSource).toMatch(/wa_supplier_invoices_supplier_id_idx\s*\n\s*ON public\.wa_supplier_invoices\(supplier_id\);/);
    expect(migrationSource).toMatch(/wa_supplier_invoices_business_issue_date_idx\s*\n\s*ON public\.wa_supplier_invoices\(business_id, issue_date\);/);
    expect(migrationSource).toMatch(
      /wa_supplier_invoices_business_due_date_idx\s*\n\s*ON public\.wa_supplier_invoices\(business_id, due_date\)\s*\n\s*WHERE due_date IS NOT NULL;/,
    );
  });

  it('trigger updated_at reutiliza wa_set_updated_at() (función ya existente, no crea una nueva)', () => {
    expect(migrationSource).toMatch(
      /CREATE TRIGGER wa_supplier_invoices_updated_at\s*\n\s*BEFORE UPDATE ON public\.wa_supplier_invoices\s*\n\s*FOR EACH ROW EXECUTE FUNCTION public\.wa_set_updated_at\(\);/,
    );
    expect(migrationSource).not.toMatch(/CREATE (OR REPLACE )?FUNCTION public\.wa_set_updated_at/);
  });

  it('RLS: una sola política FOR ALL con USING+WITH CHECK (estilo "moderno", no el split de 4 políticas de wa_suppliers)', () => {
    expect(migrationSource).toMatch(
      /CREATE POLICY "wa_supplier_invoices_owner" ON public\.wa_supplier_invoices\s*\n\s*FOR ALL TO authenticated\s*\n\s*USING \(business_id IN \(SELECT id FROM public\.wa_businesses WHERE user_id = auth\.uid\(\)\)\)\s*\n\s*WITH CHECK \(business_id IN \(SELECT id FROM public\.wa_businesses WHERE user_id = auth\.uid\(\)\)\);/,
    );
  });

  it('grants explícitos de SELECT/INSERT/UPDATE/DELETE a authenticated (escritura directa permitida, sin RPC)', () => {
    expect(migrationSource).toMatch(
      /GRANT SELECT, INSERT, UPDATE, DELETE ON public\.wa_supplier_invoices TO authenticated;/,
    );
  });
});

describe('wa_supplier_payments — pago real', () => {
  it('columnas pedidas en CORE-2 sección 5, sin funding_source/cash_session_id/cash_movement_id', () => {
    const tableMatch = migrationSource.match(
      /CREATE TABLE IF NOT EXISTS public\.wa_supplier_payments \([\s\S]*?\n\);/,
    );
    expect(tableMatch).not.toBeNull();
    for (const col of ['id', 'business_id', 'supplier_id', 'payment_date', 'amount', 'payment_method', 'reference', 'notes', 'created_by', 'created_at']) {
      expect(tableMatch[0]).toMatch(new RegExp(`\\b${col}\\b`));
    }
  });

  it('amount > 0', () => {
    expect(migrationSource).toMatch(/amount\s+NUMERIC\(14,2\) NOT NULL CHECK \(amount > 0\),\n\s*payment_method/);
  });

  it('payment_method restringido a cash/transfer/card/check/other (exactamente los 5 pedidos)', () => {
    expect(migrationSource).toMatch(
      /payment_method\s+TEXT NOT NULL CHECK \(payment_method IN\s*\n\s*\('cash', 'transfer', 'card', 'check', 'other'\)\)/,
    );
  });

  it('supplier_id ON DELETE RESTRICT', () => {
    expect(migrationSource).toMatch(
      /CREATE TABLE IF NOT EXISTS public\.wa_supplier_payments[\s\S]*?supplier_id\s+UUID NOT NULL REFERENCES public\.wa_suppliers\(id\) ON DELETE RESTRICT,/,
    );
  });

  it('RLS: solo política de SELECT -- CERO políticas de INSERT/UPDATE/DELETE', () => {
    const rlsBlock = migrationSource.slice(
      migrationSource.indexOf('-- 3. wa_supplier_payments'),
      migrationSource.indexOf('-- 4. wa_supplier_payment_allocations'),
    );
    expect(rlsBlock).toMatch(/CREATE POLICY "wa_supplier_payments_select" ON public\.wa_supplier_payments\s*\n\s*FOR SELECT TO authenticated/);
    expect(rlsBlock).not.toMatch(/FOR INSERT/);
    expect(rlsBlock).not.toMatch(/FOR UPDATE/);
    expect(rlsBlock).not.toMatch(/FOR DELETE/);
  });

  it('grant de tabla limitado a SELECT (no INSERT/UPDATE/DELETE otorgado a authenticated)', () => {
    expect(migrationSource).toMatch(/GRANT SELECT ON public\.wa_supplier_payments TO authenticated;/);
    expect(migrationSource).not.toMatch(/GRANT [^;]*INSERT[^;]* ON public\.wa_supplier_payments/);
  });
});

describe('wa_supplier_payment_allocations — reparto de pagos', () => {
  it('columnas pedidas + business_id denormalizado explícito', () => {
    const tableMatch = migrationSource.match(
      /CREATE TABLE IF NOT EXISTS public\.wa_supplier_payment_allocations \([\s\S]*?\n\);/,
    );
    expect(tableMatch).not.toBeNull();
    for (const col of ['id', 'business_id', 'payment_id', 'invoice_id', 'amount', 'created_at']) {
      expect(tableMatch[0]).toMatch(new RegExp(`\\b${col}\\b`));
    }
  });

  it('amount > 0', () => {
    expect(migrationSource).toMatch(/amount\s+NUMERIC\(14,2\) NOT NULL CHECK \(amount > 0\),\n\s*created_at/);
  });

  it('UNIQUE(payment_id, invoice_id)', () => {
    expect(migrationSource).toMatch(
      /CONSTRAINT wa_supplier_payment_allocations_payment_invoice_uq UNIQUE \(payment_id, invoice_id\)/,
    );
  });

  it('payment_id ON DELETE CASCADE, invoice_id ON DELETE RESTRICT', () => {
    expect(migrationSource).toMatch(
      /payment_id\s+UUID NOT NULL REFERENCES public\.wa_supplier_payments\(id\) ON DELETE CASCADE,/,
    );
    expect(migrationSource).toMatch(
      /invoice_id\s+UUID NOT NULL REFERENCES public\.wa_supplier_invoices\(id\) ON DELETE RESTRICT,/,
    );
  });

  it('RLS: solo SELECT, cero políticas de escritura (misma razón que wa_supplier_payments)', () => {
    const rlsBlock = migrationSource.slice(
      migrationSource.indexOf('-- 4. wa_supplier_payment_allocations'),
      migrationSource.indexOf('-- 5. wa_supplier_invoice_balances'),
    );
    expect(rlsBlock).toMatch(/CREATE POLICY "wa_supplier_payment_allocations_select"/);
    expect(rlsBlock).not.toMatch(/FOR INSERT/);
    expect(rlsBlock).not.toMatch(/FOR UPDATE/);
    expect(rlsBlock).not.toMatch(/FOR DELETE/);
  });
});

describe('wa_supplier_invoice_balances — balances derivados', () => {
  it('la vista existe y proyecta paid_amount/balance/payment_status/is_overdue', () => {
    expect(viewMatch).not.toBeNull();
    for (const col of ['paid_amount', 'balance', 'payment_status', 'is_overdue']) {
      expect(viewMatch[0]).toMatch(new RegExp(col));
    }
  });

  it('payment_status: pending/partial/paid, derivado de SUM(allocations) vs total_amount -- no hardcodea un status almacenado', () => {
    expect(viewMatch[0]).toMatch(/WHEN COALESCE\(a\.paid_amount, 0\) <= 0 THEN 'pending'/);
    expect(viewMatch[0]).toMatch(/WHEN COALESCE\(a\.paid_amount, 0\) >= i\.total_amount THEN 'paid'/);
    expect(viewMatch[0]).toMatch(/ELSE 'partial'/);
  });

  it('is_overdue exige due_date NOT NULL, due_date < CURRENT_DATE, Y balance > 0 -- las tres condiciones', () => {
    expect(viewMatch[0]).toMatch(/i\.due_date IS NOT NULL/);
    expect(viewMatch[0]).toMatch(/AND i\.due_date < CURRENT_DATE/);
    expect(viewMatch[0]).toMatch(/AND i\.total_amount - COALESCE\(a\.paid_amount, 0\) > 0\)/);
  });

  it('payment_status e is_overdue son columnas independientes -- nunca un único enum de 4 valores (partial+overdue debe poder coexistir)', () => {
    expect(viewMatch[0]).toMatch(/AS payment_status,/);
    expect(viewMatch[0]).toMatch(/AS is_overdue/);
  });

  it('aislamiento multitenant hardcodeado EN la vista (no depende de security_invoker ni de RLS heredada del owner)', () => {
    expect(viewMatch[0]).toMatch(
      /WHERE i\.business_id IN \(SELECT id FROM public\.wa_businesses WHERE user_id = auth\.uid\(\)\);/,
    );
    expect(codeOnly).not.toMatch(/security_invoker/i);
  });

  it('grant de SELECT a authenticated sobre la vista', () => {
    expect(migrationSource).toMatch(/GRANT SELECT ON public\.wa_supplier_invoice_balances TO authenticated;/);
  });
});

describe('wa_register_supplier_payment — RPC atómica', () => {
  it('existe, SECURITY DEFINER, search_path explícito', () => {
    expect(rpcMatch).not.toBeNull();
    expect(rpcMatch[0]).toMatch(/LANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = public/);
  });

  it('REVOKE ALL FROM PUBLIC + GRANT EXECUTE solo a authenticated', () => {
    expect(migrationSource).toMatch(
      /REVOKE ALL ON FUNCTION public\.wa_register_supplier_payment\(\s*\n\s*UUID, UUID, NUMERIC, TEXT, DATE, TEXT, TEXT, JSONB\s*\n\) FROM PUBLIC;/,
    );
    expect(migrationSource).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.wa_register_supplier_payment\(\s*\n\s*UUID, UUID, NUMERIC, TEXT, DATE, TEXT, TEXT, JSONB\s*\n\) TO authenticated;/,
    );
  });

  it('nunca confía en business ownership del cliente -- valida auth.uid() contra wa_businesses server-side', () => {
    expect(rpcMatch[0]).toMatch(/v_user_id\s+UUID := auth\.uid\(\);/);
    expect(rpcMatch[0]).toMatch(
      /IF NOT EXISTS \(\s*\n\s*SELECT 1 FROM public\.wa_businesses WHERE id = p_business_id AND user_id = v_user_id\s*\n\s*\) THEN/,
    );
  });

  it('valida: usuario autenticado, parámetros requeridos, amount > 0, método permitido, supplier pertenece al business -- en ese orden relativo', () => {
    const src = rpcMatch[0];
    const idx = (s) => src.indexOf(s);
    const authIdx = idx("RAISE EXCEPTION 'NOT_AUTHENTICATED'");
    const amountIdx = idx("RAISE EXCEPTION 'INVALID_AMOUNT'");
    const methodIdx = idx("RAISE EXCEPTION 'INVALID_PAYMENT_METHOD'");
    const businessIdx = idx('Business not accessible');
    const supplierIdx = idx("RAISE EXCEPTION 'SUPPLIER_NOT_FOUND'");
    for (const i of [authIdx, amountIdx, methodIdx, businessIdx, supplierIdx]) {
      expect(i).toBeGreaterThan(-1);
    }
    expect(authIdx).toBeLessThan(amountIdx);
    expect(amountIdx).toBeLessThan(businessIdx);
    expect(businessIdx).toBeLessThan(supplierIdx);
  });

  it('allocations: valida estructura, monto > 0, sin duplicados, ANTES de tocar la base de datos', () => {
    const src = rpcMatch[0];
    expect(src).toMatch(/IF jsonb_typeof\(COALESCE\(p_allocations, '\[\]'::jsonb\)\) <> 'array' THEN/);
    expect(src).toMatch(/IF v_invoice_id IS NULL OR v_alloc_amount IS NULL OR v_alloc_amount <= 0 THEN/);
    expect(src).toMatch(/IF v_invoice_id = ANY\(v_seen_invoice_ids\) THEN/);
    expect(src).toMatch(/RAISE EXCEPTION 'DUPLICATE_ALLOCATION_INVOICE'/);
  });

  it('CORE-2B: SUM(allocations) debe ser EXACTAMENTE igual al payment amount -- ya no "<=" (ver describe de CORE-2B más abajo para los 4 escenarios A-D)', () => {
    expect(rpcMatch[0]).toMatch(
      /IF v_sum_allocations <> p_amount THEN\s*\n\s*RAISE EXCEPTION 'ALLOCATIONS_MUST_EQUAL_PAYMENT_AMOUNT'/,
    );
    expect(rpcMatch[0]).not.toMatch(/ALLOCATIONS_EXCEED_PAYMENT/);
    expect(rpcMatch[0]).not.toMatch(/v_sum_allocations > p_amount/);
  });

  it('bloquea las facturas referenciadas con SELECT ... FOR UPDATE, en orden determinístico (ORDER BY id) -- previene deadlocks entre llamadas concurrentes con conjuntos superpuestos', () => {
    expect(rpcMatch[0]).toMatch(
      /SELECT id, business_id, supplier_id, total_amount\s*\n\s*FROM public\.wa_supplier_invoices\s*\n\s*WHERE id = ANY\(v_seen_invoice_ids\)\s*\n\s*ORDER BY id\s*\n\s*FOR UPDATE/,
    );
  });

  it('cada factura debe pertenecer al mismo business Y al mismo supplier del pago', () => {
    expect(rpcMatch[0]).toMatch(/RAISE EXCEPTION 'INVOICE_NOT_FOUND'/);
    expect(rpcMatch[0]).toMatch(/RAISE EXCEPTION 'INVOICE_SUPPLIER_MISMATCH'/);
    expect(rpcMatch[0]).toMatch(/IF v_locked_invoice\.business_id <> p_business_id THEN/);
    expect(rpcMatch[0]).toMatch(/IF v_locked_invoice\.supplier_id <> p_supplier_id THEN/);
  });

  it('invoice_id inexistente se detecta por conteo (found_count vs invoice_count), no se confunde con "no encontrado = negocio equivocado"', () => {
    expect(rpcMatch[0]).toMatch(/IF v_found_count <> v_invoice_count THEN/);
  });

  it('recalcula paid_so_far/balance server-side desde allocations existentes -- nunca confía en un balance enviado por el cliente', () => {
    expect(rpcMatch[0]).toMatch(
      /SELECT COALESCE\(SUM\(amount\), 0\) INTO v_paid_so_far\s*\n\s*FROM public\.wa_supplier_payment_allocations WHERE invoice_id = v_invoice_id;/,
    );
    expect(rpcMatch[0]).toMatch(/IF v_alloc_amount > v_balance THEN\s*\n\s*RAISE EXCEPTION 'ALLOCATION_EXCEEDS_BALANCE'/);
  });

  it('el chequeo de saldo disponible ocurre DESPUÉS de tomar todos los locks FOR UPDATE (nunca antes)', () => {
    const src = rpcMatch[0];
    const lockIdx = src.indexOf('FOR UPDATE');
    const balanceCheckIdx = src.indexOf("RAISE EXCEPTION 'ALLOCATION_EXCEEDS_BALANCE'");
    expect(lockIdx).toBeGreaterThan(-1);
    expect(balanceCheckIdx).toBeGreaterThan(-1);
    expect(lockIdx).toBeLessThan(balanceCheckIdx);
  });

  it('el parámetro p_allocations conserva su default \'[]\'::jsonb (la firma no cambió) -- pero CORE-2B hace que ese default siempre sea rechazado para cualquier p_amount > 0', () => {
    expect(migrationSource).toMatch(/p_allocations\s+JSONB\s+DEFAULT '\[\]'::jsonb/);
  });

  it('nunca inventa una asignación automática -- el INSERT de allocations sigue recorriendo exactamente p_allocations, nunca genera una allocation sintética para cubrir el resto', () => {
    const src = rpcMatch[0];
    expect(src.match(/IF v_invoice_count > 0 THEN/g)?.length).toBeGreaterThanOrEqual(2);
    expect(src).not.toMatch(/p_amount - v_sum_allocations/);
  });

  it('RETURNS SETOF public.wa_supplier_payments -- retorna el pago creado, mismo patrón que crm_create_pos_sale', () => {
    expect(migrationSource).toMatch(/RETURNS SETOF public\.wa_supplier_payments/);
  });
});

describe('PROVEEDORES-CORE-2B — todo pago debe quedar completamente asignado (sin anticipos)', () => {
  it('escenario A: allocations=[] con amount=100000 se rechaza -- v_sum_allocations arranca en 0, 0 <> 100000', () => {
    // p_amount <= 0 ya se rechaza antes por INVALID_AMOUNT (chequeo #4), así
    // que para cualquier payment válido p_amount siempre es > 0 -- un array
    // vacío deja v_sum_allocations en su valor inicial (0), que nunca puede
    // ser igual a un p_amount > 0. No existe un camino separado para
    // "allocations vacías": el mismo chequeo <> cubre los tres rechazos.
    const src = rpcMatch[0];
    expect(src).toMatch(/v_sum_allocations\s+NUMERIC := 0;/);
    expect(src).toMatch(/IF p_amount <= 0 THEN\s*\n\s*RAISE EXCEPTION 'INVALID_AMOUNT'/);
    expect(src).toMatch(/IF v_sum_allocations <> p_amount THEN/);
  });

  it('escenario B (suma menor: 50000 sobre payment de 100000) y C (suma mayor: 100001) se rechazan por el MISMO chequeo <>, sin caminos especiales para "de más" vs "de menos"', () => {
    // Un único operador de comparación entre v_sum_allocations y p_amount
    // en TODO el cuerpo de la función -- el "<>" (desigualdad), sin ningún
    // ">" / "<" / ">=" / "<=" adicional en otro lugar que distinga "de más"
    // de "de menos". Eso es lo que garantiza que B y C caen en el mismo
    // camino de rechazo.
    const matches = rpcMatch[0].match(/v_sum_allocations\s*(<>|>=|<=|>|<)\s*p_amount/g);
    expect(matches).toEqual(['v_sum_allocations <> p_amount']);
  });

  it('escenario D: suma exacta (100000 = 100000) se acepta -- el chequeo <> no dispara, el flujo sigue al bloqueo de facturas e inserción', () => {
    const src = rpcMatch[0];
    const checkIdx = src.indexOf('IF v_sum_allocations <> p_amount THEN');
    const insertPaymentIdx = src.indexOf('INSERT INTO public.wa_supplier_payments');
    expect(checkIdx).toBeGreaterThan(-1);
    expect(insertPaymentIdx).toBeGreaterThan(checkIdx);
  });

  it('pago parcial de UNA factura sigue permitido -- CORE-2B exige que el PAGO quede completamente asignado, no que la FACTURA quede completamente pagada (son cosas distintas: allocation puede ser menor al balance de la factura, mientras sea igual al amount del pago)', () => {
    const src = rpcMatch[0];
    expect(src).toMatch(/IF v_alloc_amount > v_balance THEN\s*\n\s*RAISE EXCEPTION 'ALLOCATION_EXCEEDS_BALANCE'/);
    // el chequeo de saldo de factura sigue siendo "allocation > balance de
    // ESA factura", no "allocation == total de la factura" -- una
    // asignación de 100000 contra una factura de 450000 sigue siendo
    // válida (100000 <= 450000), y dejaría payment_status='partial' en la
    // vista de balances, sin que eso choque con el nuevo invariante del
    // pago (100000 asignado == 100000 pagado).
  });

  it('un pago SIGUE pudiendo cubrir varias facturas -- CORE-2B no toca el soporte de múltiples allocations, solo exige que su suma sea exacta', () => {
    const src = rpcMatch[0];
    expect(src).toMatch(/FOR v_alloc IN SELECT value FROM jsonb_array_elements\(p_allocations\)/);
    expect(src).not.toMatch(/array_length\(v_seen_invoice_ids, 1\) > 1.*inválid/i);
  });

  it('múltiples pagos sobre la MISMA factura siguen permitidos -- wa_supplier_payments no tiene invoice_id (no hay 1:1 pago-factura) y no existe ningún chequeo que limite cuántas veces se llama a la RPC contra la misma factura', () => {
    const paymentsTable = migrationSource.match(
      /CREATE TABLE IF NOT EXISTS public\.wa_supplier_payments \([\s\S]*?\n\);/,
    );
    expect(paymentsTable).not.toBeNull();
    expect(paymentsTable[0]).not.toMatch(/invoice_id/);
    // El único límite es que cada allocation individual no exceda el saldo
    // disponible en ese momento (ALLOCATION_EXCEEDS_BALANCE), ya cubierto
    // en un test aparte arriba -- no hay ningún UNIQUE ni CHECK que cuente
    // cuántos pagos tocó una factura.
  });

  it('locks FOR UPDATE y orden determinístico (ORDER BY id) no se tocaron por CORE-2B', () => {
    expect(rpcMatch[0]).toMatch(
      /WHERE id = ANY\(v_seen_invoice_ids\)\s*\n\s*ORDER BY id\s*\n\s*FOR UPDATE/,
    );
  });

  it('ownership server-side, RLS y grants no se tocaron por CORE-2B', () => {
    expect(migrationSource).toMatch(/SELECT 1 FROM public\.wa_businesses WHERE id = p_business_id AND user_id = v_user_id/);
    expect(migrationSource).toMatch(/CREATE POLICY "wa_supplier_payments_select"/);
    expect(migrationSource).toMatch(/GRANT SELECT ON public\.wa_supplier_payments TO authenticated;/);
    expect(migrationSource).not.toMatch(/GRANT [^;]*INSERT[^;]* ON public\.wa_supplier_payments/);
  });

  it('balances derivados (vista) no se tocaron por CORE-2B -- siguen sin columnas almacenadas', () => {
    expect(viewMatch).not.toBeNull();
    expect(migrationSource).not.toMatch(/ALTER TABLE public\.wa_supplier_invoices ADD COLUMN/);
  });

  it('NO se crea ninguna entidad de anticipo/crédito a favor -- explícitamente prohibido en CORE-2B', () => {
    for (const forbidden of ['supplier_credit', 'supplier_balance', 'advance_payment', 'unallocated_amount', 'credit_balance']) {
      expect(codeOnly).not.toMatch(new RegExp(forbidden, 'i'));
    }
  });
});
