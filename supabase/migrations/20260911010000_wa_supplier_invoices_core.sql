-- ============================================================
-- PROVEEDORES-CORE-2 — backend canónico de facturas/compras y pagos
-- de proveedor.
--
-- Diseño aprobado en PROVEEDORES-CORE-1 (Opción B): nueva entidad
-- canónica wa_supplier_invoices que unifica lo que hoy vive partido
-- entre wa_supplier_debts (deuda simple) y crm_purchase_invoices
-- (factura orientada a IVA). Esta migración SOLO crea la infra nueva:
--
--   NO migra datos de wa_supplier_debts ni de crm_purchase_invoices.
--   NO toca /crm/compras ni ningún servicio/página existente.
--   NO integra con crm_cash_movements/crm_cost_items todavía.
--   NO agrega adjuntos todavía.
--
-- wa_supplier_debts y crm_purchase_invoices siguen existiendo exactamente
-- igual que hoy, sin ningún cambio de comportamiento para el usuario.
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Extender wa_suppliers (RUT/razón social/dirección)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Precheck (PROVEEDORES-CORE-2, sección 2): antes de nombrar la columna
-- "tax_id" (como proponía CORE-1) se auditó si ya existe un campo de RUT
-- en el schema con otro nombre. Sí existe: wa_customers.rut (agregado en
-- 20260530100000_crm_module.sql), texto plano, sin validación de formato.
-- Se sigue esa misma convención acá por consistencia -- "rut", no "tax_id".
-- "address" también tiene precedente exacto en wa_customers (mismo
-- migration). "legal_name" no tiene precedente en el schema -- se introduce
-- tal cual lo definió CORE-1 (razón social, distinta del nombre comercial
-- "name" que ya existía).
ALTER TABLE public.wa_suppliers
  ADD COLUMN IF NOT EXISTS rut        TEXT,
  ADD COLUMN IF NOT EXISTS legal_name TEXT,
  ADD COLUMN IF NOT EXISTS address    TEXT;

-- Único por negocio cuando se informa (nunca bloquea proveedores sin RUT,
-- que van a seguir existiendo -- ningún dato existente se toca).
CREATE UNIQUE INDEX IF NOT EXISTS wa_suppliers_business_rut_uq
  ON public.wa_suppliers (business_id, rut)
  WHERE rut IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. wa_supplier_invoices — factura/compra canónica
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Sin status, sin amount_paid, sin balance almacenados (CORE-1 sección 5/7):
-- se derivan siempre desde wa_supplier_payment_allocations vía la vista de
-- abajo, nunca se persisten acá -- cero riesgo de quedar inconsistentes.
--
-- supplier_id es ON DELETE RESTRICT (a diferencia del CASCADE que tiene hoy
-- wa_supplier_debts.supplier_id): impide borrar un proveedor con historial
-- de facturas por error: fuerza un archivado explícito en vez de perder
-- registros financieros en silencio.
CREATE TABLE IF NOT EXISTS public.wa_supplier_invoices (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  supplier_id      UUID NOT NULL REFERENCES public.wa_suppliers(id) ON DELETE RESTRICT,

  document_type    TEXT NOT NULL CHECK (document_type IN
                      ('factura', 'boleta', 'nota_credito', 'legacy_debt', 'other')),
  document_number  TEXT,

  issue_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date         DATE,

  purchase_type    TEXT CHECK (purchase_type IN
                      ('mercaderia', 'gasto_con_iva', 'gasto_sin_iva', 'servicio', 'otros')),

  net_amount       NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (net_amount >= 0),
  tax_rate         NUMERIC(5,2)  NOT NULL DEFAULT 0 CHECK (tax_rate >= 0),
  tax_amount       NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total_amount     NUMERIC(14,2) NOT NULL CHECK (total_amount >= 0),

  notes            TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wa_supplier_invoices_business_id_idx
  ON public.wa_supplier_invoices(business_id);
CREATE INDEX IF NOT EXISTS wa_supplier_invoices_supplier_id_idx
  ON public.wa_supplier_invoices(supplier_id);
CREATE INDEX IF NOT EXISTS wa_supplier_invoices_business_issue_date_idx
  ON public.wa_supplier_invoices(business_id, issue_date);
CREATE INDEX IF NOT EXISTS wa_supplier_invoices_business_due_date_idx
  ON public.wa_supplier_invoices(business_id, due_date)
  WHERE due_date IS NOT NULL;

-- Sección 4 (CORE-2): unicidad documental explícitamente NO reducida a
-- (business_id, supplier_id, document_number) -- eso rechazaría, por
-- ejemplo, una factura Nº 100 y una nota de crédito Nº 100 del mismo
-- proveedor, que son documentos distintos y perfectamente válidos en
-- paralelo. Se incluye document_type en la clave para evitar ese falso
-- positivo, manteniendo la protección real que se busca: no cargar la
-- MISMA factura dos veces por error.
CREATE UNIQUE INDEX IF NOT EXISTS wa_supplier_invoices_doc_uq
  ON public.wa_supplier_invoices (business_id, supplier_id, document_type, document_number)
  WHERE document_number IS NOT NULL;

DROP TRIGGER IF EXISTS wa_supplier_invoices_updated_at ON public.wa_supplier_invoices;
CREATE TRIGGER wa_supplier_invoices_updated_at
  BEFORE UPDATE ON public.wa_supplier_invoices
  FOR EACH ROW EXECUTE FUNCTION public.wa_set_updated_at();

ALTER TABLE public.wa_supplier_invoices ENABLE ROW LEVEL SECURITY;

-- Estilo de política única FOR ALL (el "moderno", igual que crm_invoices)
-- en vez del split de 4 políticas por-verbo que tiene hoy wa_suppliers --
-- decisión explícita de CORE-1 para no seguir arrastrando la
-- inconsistencia de estilos ya detectada en la auditoría CORE-0.
DROP POLICY IF EXISTS "wa_supplier_invoices_owner" ON public.wa_supplier_invoices;
CREATE POLICY "wa_supplier_invoices_owner" ON public.wa_supplier_invoices
  FOR ALL TO authenticated
  USING (business_id IN (SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_supplier_invoices TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. wa_supplier_payments — pago real (puede cubrir 0..N facturas)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Deliberadamente SIN funding_source / cash_session_id / cash_movement_id
-- en esta fase (CORE-2, sección 5): esas columnas comprometerían ahora un
-- modelo de integración Caja/Bancos que todavía no se diseñó en detalle.
-- Se agregan en una fase posterior si hace falta -- agregar una columna
-- nullable más adelante no rompe nada de lo que se crea acá.
--
-- supplier_id ON DELETE RESTRICT, misma razón que en wa_supplier_invoices.
CREATE TABLE IF NOT EXISTS public.wa_supplier_payments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  supplier_id      UUID NOT NULL REFERENCES public.wa_suppliers(id) ON DELETE RESTRICT,

  payment_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  amount           NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  payment_method   TEXT NOT NULL CHECK (payment_method IN
                      ('cash', 'transfer', 'card', 'check', 'other')),
  reference        TEXT,
  notes            TEXT,

  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wa_supplier_payments_business_id_idx
  ON public.wa_supplier_payments(business_id);
CREATE INDEX IF NOT EXISTS wa_supplier_payments_supplier_id_idx
  ON public.wa_supplier_payments(supplier_id);
CREATE INDEX IF NOT EXISTS wa_supplier_payments_business_date_idx
  ON public.wa_supplier_payments(business_id, payment_date);

ALTER TABLE public.wa_supplier_payments ENABLE ROW LEVEL SECURITY;

-- Solo SELECT bajo RLS. NUNCA se crea política de INSERT/UPDATE/DELETE acá
-- a propósito: sin una política que autorice esos comandos, RLS los deniega
-- por defecto para el rol `authenticated`, sin importar qué GRANT de tabla
-- exista. Todo alta pasa exclusivamente por wa_register_supplier_payment
-- (SECURITY DEFINER, corre como el owner de la función -- eso sí bypasea
-- RLS, es el único camino de escritura). Nadie puede borrar un pago
-- financiero directamente desde el cliente (sección 11, CORE-2): no existe
-- ninguna vía, ni RLS ni RPC, para hacerlo en esta fase.
DROP POLICY IF EXISTS "wa_supplier_payments_select" ON public.wa_supplier_payments;
CREATE POLICY "wa_supplier_payments_select" ON public.wa_supplier_payments
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()));

GRANT SELECT ON public.wa_supplier_payments TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. wa_supplier_payment_allocations — reparto de un pago entre facturas
-- ─────────────────────────────────────────────────────────────────────────────
--
-- business_id denormalizado a propósito (además de derivable vía payment_id
-- o invoice_id): simplifica la política RLS a una comparación directa en
-- vez de un EXISTS de dos saltos en cada fila. No hay riesgo real de
-- divergencia porque el único escritor de esta tabla es la RPC de abajo,
-- que ya valida consistencia antes de insertar -- nunca un INSERT directo
-- del cliente.
CREATE TABLE IF NOT EXISTS public.wa_supplier_payment_allocations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  payment_id       UUID NOT NULL REFERENCES public.wa_supplier_payments(id) ON DELETE CASCADE,
  invoice_id       UUID NOT NULL REFERENCES public.wa_supplier_invoices(id) ON DELETE RESTRICT,
  amount           NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT wa_supplier_payment_allocations_payment_invoice_uq UNIQUE (payment_id, invoice_id)
);

CREATE INDEX IF NOT EXISTS wa_supplier_payment_allocations_business_id_idx
  ON public.wa_supplier_payment_allocations(business_id);
CREATE INDEX IF NOT EXISTS wa_supplier_payment_allocations_payment_id_idx
  ON public.wa_supplier_payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS wa_supplier_payment_allocations_invoice_id_idx
  ON public.wa_supplier_payment_allocations(invoice_id);

ALTER TABLE public.wa_supplier_payment_allocations ENABLE ROW LEVEL SECURITY;

-- Mismo criterio que wa_supplier_payments: solo SELECT, cero políticas de
-- escritura -- "no crear una falsa seguridad donde RLS permita modificar
-- allocations y romper balances" (sección 11, CORE-2). Todo INSERT pasa
-- por la RPC, atómico junto con el pago que lo origina.
DROP POLICY IF EXISTS "wa_supplier_payment_allocations_select" ON public.wa_supplier_payment_allocations;
CREATE POLICY "wa_supplier_payment_allocations_select" ON public.wa_supplier_payment_allocations
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()));

GRANT SELECT ON public.wa_supplier_payment_allocations TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. wa_supplier_invoice_balances — balances derivados (nunca almacenados)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- payment_status y is_overdue son DOS dimensiones independientes, no un
-- único enum de 4 valores (CORE-1, sección G): una factura puede ser
-- 'partial' Y is_overdue=true al mismo tiempo -- la vista expone ambas por
-- separado, la UI decide cómo combinarlas.
--
-- Aislamiento multitenant: el filtro por business_id va EXPLÍCITO dentro
-- de la vista (no se depende de RLS "heredada" de las tablas base). En
-- Postgres, una vista corre por defecto con los privilegios/ownership de
-- quien la creó, no necesariamente los del usuario que consulta -- si el
-- owner de la vista tuviera BYPASSRLS (habitual para el rol admin de
-- Supabase), la vista podría filtrar RLS de las tablas base sin que nadie
-- lo note. Hardcodear el predicado acá hace que el aislamiento no dependa
-- de esa semántica ni de la versión de Postgres (evita además cualquier
-- duda sobre soporte de `security_invoker`, opción de PG15+).
CREATE OR REPLACE VIEW public.wa_supplier_invoice_balances AS
SELECT
  i.id                                                       AS invoice_id,
  i.business_id,
  i.supplier_id,
  i.total_amount,
  COALESCE(a.paid_amount, 0)                                 AS paid_amount,
  i.total_amount - COALESCE(a.paid_amount, 0)                AS balance,
  CASE
    WHEN COALESCE(a.paid_amount, 0) <= 0 THEN 'pending'
    WHEN COALESCE(a.paid_amount, 0) >= i.total_amount THEN 'paid'
    ELSE 'partial'
  END                                                         AS payment_status,
  (i.due_date IS NOT NULL
    AND i.due_date < CURRENT_DATE
    AND i.total_amount - COALESCE(a.paid_amount, 0) > 0)      AS is_overdue
FROM public.wa_supplier_invoices i
LEFT JOIN (
  SELECT invoice_id, SUM(amount) AS paid_amount
  FROM public.wa_supplier_payment_allocations
  GROUP BY invoice_id
) a ON a.invoice_id = i.id
WHERE i.business_id IN (SELECT id FROM public.wa_businesses WHERE user_id = auth.uid());

GRANT SELECT ON public.wa_supplier_invoice_balances TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. wa_register_supplier_payment — RPC atómica de registro de pago
-- ─────────────────────────────────────────────────────────────────────────────
--
-- p_allocations: JSONB array de {invoice_id: uuid, amount: numeric}.
-- PROVEEDORES-CORE-2B: todo pago debe quedar COMPLETAMENTE asignado --
-- SUM(p_allocations.amount) debe ser EXACTAMENTE igual a p_amount, nunca
-- menos ni más. p_allocations = '[]'::jsonb (el default del parámetro)
-- ahora siempre se rechaza para un p_amount > 0 (que es el único caso
-- posible -- p_amount <= 0 ya se rechaza antes por INVALID_AMOUNT): con
-- v_sum_allocations arrancando en 0, la comparación 0 <> p_amount falla
-- sola, sin necesidad de un chequeo de vacío separado.
--
-- Decisión explícita de esta fase (CORE-2B, no CORE-2): permitir un
-- remanente sin asignar crea implícitamente un anticipo/saldo a favor del
-- proveedor, y todavía no existe modelo funcional, KPI, UI ni proceso de
-- aplicación posterior para ese crédito -- se cierra la puerta acá en vez
-- de dejar datos "flotando" sin semántica definida. No se crea ninguna
-- entidad de anticipo/crédito (supplier_credit, supplier_balance,
-- advance_payment, unallocated_amount, credit_balance ni variantes) --
-- eso queda completamente fuera de esta versión.
--
-- Concurrencia (sección 9, CORE-2 -- "crítico"): antes de calcular saldo
-- disponible de cada factura, se bloquean TODAS las facturas referenciadas
-- en p_allocations con SELECT ... FOR UPDATE, en un orden determinístico
-- (ORDER BY id ascendente). El orden fijo es lo que evita deadlocks entre
-- dos llamadas concurrentes que tocan un conjunto de facturas superpuesto
-- en órdenes distintos -- sin esto, la llamada A podría bloquear la
-- factura que B ya tomó mientras B espera la que A ya tomó (deadlock
-- clásico); con un orden fijo, ambas siempre intentan tomar los locks en
-- la misma secuencia, así que en el peor caso una espera a la otra, nunca
-- se traban mutuamente. Ninguna otra transacción puede insertar una
-- allocation contra una factura ya bloqueada por esta llamada hasta que
-- esta haga COMMIT/ROLLBACK, porque la ÚNICA vía de escritura de
-- allocations es esta misma función, y siempre toma el lock de la factura
-- ANTES de leer/escribir sus allocations -- exactamente el mismo patrón
-- que ya usa crm_apply_stock_movement (20260910220000_crm_pos_atomic_sale.sql)
-- para stock.
CREATE OR REPLACE FUNCTION public.wa_register_supplier_payment(
  p_business_id     UUID,
  p_supplier_id     UUID,
  p_amount          NUMERIC,
  p_payment_method  TEXT,
  p_payment_date    DATE DEFAULT CURRENT_DATE,
  p_reference       TEXT DEFAULT NULL,
  p_notes           TEXT DEFAULT NULL,
  p_allocations     JSONB DEFAULT '[]'::jsonb
)
RETURNS SETOF public.wa_supplier_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id           UUID := auth.uid();
  v_method            TEXT;
  v_payment           public.wa_supplier_payments;
  v_alloc             JSONB;
  v_invoice_id        UUID;
  v_alloc_amount      NUMERIC;
  v_sum_allocations   NUMERIC := 0;
  v_seen_invoice_ids  UUID[] := ARRAY[]::UUID[];
  v_invoice_count     INTEGER;
  v_found_count       INTEGER := 0;
  v_locked_invoice    RECORD;
  v_total_amount      NUMERIC;
  v_paid_so_far       NUMERIC;
  v_balance           NUMERIC;
BEGIN
  -- 1) usuario autenticado
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'P0001';
  END IF;

  IF p_business_id IS NULL OR p_supplier_id IS NULL OR p_amount IS NULL
     OR p_payment_method IS NULL THEN
    RAISE EXCEPTION 'MISSING_REQUIRED_PARAMETER' USING ERRCODE = 'P0001';
  END IF;

  -- 4) amount > 0
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = '23514';
  END IF;

  -- 5) método permitido
  v_method := lower(trim(p_payment_method));
  IF v_method NOT IN ('cash', 'transfer', 'card', 'check', 'other') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_METHOD' USING ERRCODE = '23514';
  END IF;

  -- 2) business pertenece al usuario -- SECURITY DEFINER bypasea RLS, este
  -- chequeo es la única barrera real; nunca se confía en p_business_id
  -- del cliente por sí solo.
  IF NOT EXISTS (
    SELECT 1 FROM public.wa_businesses WHERE id = p_business_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Business not accessible' USING ERRCODE = '42501';
  END IF;

  -- 3) proveedor pertenece al business
  IF NOT EXISTS (
    SELECT 1 FROM public.wa_suppliers WHERE id = p_supplier_id AND business_id = p_business_id
  ) THEN
    RAISE EXCEPTION 'SUPPLIER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- 6) allocations válidas (estructura) + 9) monto > 0 + 10) sin duplicados
  IF jsonb_typeof(COALESCE(p_allocations, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_ALLOCATIONS' USING ERRCODE = '23514';
  END IF;

  FOR v_alloc IN SELECT value FROM jsonb_array_elements(COALESCE(p_allocations, '[]'::jsonb))
  LOOP
    v_invoice_id   := NULLIF(v_alloc->>'invoice_id', '')::UUID;
    v_alloc_amount := (v_alloc->>'amount')::NUMERIC;

    IF v_invoice_id IS NULL OR v_alloc_amount IS NULL OR v_alloc_amount <= 0 THEN
      RAISE EXCEPTION 'INVALID_ALLOCATIONS' USING ERRCODE = '23514';
    END IF;

    IF v_invoice_id = ANY(v_seen_invoice_ids) THEN
      RAISE EXCEPTION 'DUPLICATE_ALLOCATION_INVOICE' USING ERRCODE = '23514';
    END IF;

    v_seen_invoice_ids := array_append(v_seen_invoice_ids, v_invoice_id);
    v_sum_allocations  := v_sum_allocations + v_alloc_amount;
  END LOOP;

  -- 11) CORE-2B: SUM(allocations) DEBE ser exactamente igual al monto del
  -- pago -- ya no "<=". Cubre en un solo chequeo los tres rechazos pedidos:
  -- allocations=[] (v_sum_allocations queda en 0, 0 <> p_amount), suma
  -- menor (parcialmente asignado) y suma mayor (sobreasignado). Ningún
  -- pago puede quedar con remanente sin asignar en esta fase.
  IF v_sum_allocations <> p_amount THEN
    RAISE EXCEPTION 'ALLOCATIONS_MUST_EQUAL_PAYMENT_AMOUNT' USING ERRCODE = '23514';
  END IF;

  v_invoice_count := COALESCE(array_length(v_seen_invoice_ids, 1), 0);

  -- 7) cada invoice pertenece al business + 8) al mismo proveedor,
  -- bloqueando bajo FOR UPDATE en orden determinístico (ver comentario de
  -- la función). CORE-2B: v_invoice_count siempre será > 0 acá -- el
  -- chequeo de arriba ya rechazó cualquier combinación que permitiera
  -- llegar con el array vacío (p_amount > 0 siempre, por INVALID_AMOUNT) --
  -- se conserva el IF como defensa explícita, sin asumir la garantía.
  IF v_invoice_count > 0 THEN
    FOR v_locked_invoice IN
      SELECT id, business_id, supplier_id, total_amount
      FROM public.wa_supplier_invoices
      WHERE id = ANY(v_seen_invoice_ids)
      ORDER BY id
      FOR UPDATE
    LOOP
      v_found_count := v_found_count + 1;

      IF v_locked_invoice.business_id <> p_business_id THEN
        RAISE EXCEPTION 'INVOICE_NOT_FOUND' USING ERRCODE = 'P0001';
      END IF;

      IF v_locked_invoice.supplier_id <> p_supplier_id THEN
        RAISE EXCEPTION 'INVOICE_SUPPLIER_MISMATCH' USING ERRCODE = 'P0001';
      END IF;
    END LOOP;

    -- Un invoice_id inexistente simplemente no aparece en el loop de
    -- arriba (WHERE id = ANY(...) no lo trae) -- se detecta acá por
    -- conteo, en vez de asumir en silencio que "no encontrado" es lo mismo
    -- que "no pertenece al negocio".
    IF v_found_count <> v_invoice_count THEN
      RAISE EXCEPTION 'INVOICE_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;

    -- 12) cada allocation no puede superar el saldo disponible real,
    -- recalculado server-side desde las allocations YA existentes --
    -- nunca se confía en un balance enviado por el cliente. Esto corre
    -- DESPUÉS de que todas las facturas relevantes ya están bloqueadas
    -- (bloqueo tomado arriba), así que el SUM de acá es consistente: si
    -- otra transacción concurrente hubiera insertado una allocation contra
    -- alguna de estas facturas, tuvo que haber tomado el mismo FOR UPDATE
    -- antes -- o ya hizo commit y este SUM la ve, o sigue en vuelo y esta
    -- llamada esperó el lock hasta que resolviera.
    FOR v_alloc IN SELECT value FROM jsonb_array_elements(p_allocations)
    LOOP
      v_invoice_id   := (v_alloc->>'invoice_id')::UUID;
      v_alloc_amount := (v_alloc->>'amount')::NUMERIC;

      SELECT total_amount INTO v_total_amount
        FROM public.wa_supplier_invoices WHERE id = v_invoice_id;

      SELECT COALESCE(SUM(amount), 0) INTO v_paid_so_far
        FROM public.wa_supplier_payment_allocations WHERE invoice_id = v_invoice_id;

      v_balance := v_total_amount - v_paid_so_far;

      IF v_alloc_amount > v_balance THEN
        RAISE EXCEPTION 'ALLOCATION_EXCEEDS_BALANCE' USING ERRCODE = 'P0001';
      END IF;
    END LOOP;
  END IF;

  -- ── Todo validado: crear el pago + sus allocations ──────────────────
  INSERT INTO public.wa_supplier_payments (
    business_id, supplier_id, payment_date, amount, payment_method,
    reference, notes, created_by
  ) VALUES (
    p_business_id, p_supplier_id, COALESCE(p_payment_date, CURRENT_DATE), p_amount, v_method,
    p_reference, p_notes, v_user_id
  )
  RETURNING * INTO v_payment;

  IF v_invoice_count > 0 THEN
    FOR v_alloc IN SELECT value FROM jsonb_array_elements(p_allocations)
    LOOP
      INSERT INTO public.wa_supplier_payment_allocations (
        business_id, payment_id, invoice_id, amount
      ) VALUES (
        p_business_id, v_payment.id, (v_alloc->>'invoice_id')::UUID, (v_alloc->>'amount')::NUMERIC
      );
    END LOOP;
  END IF;

  RETURN NEXT v_payment;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.wa_register_supplier_payment(
  UUID, UUID, NUMERIC, TEXT, DATE, TEXT, TEXT, JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wa_register_supplier_payment(
  UUID, UUID, NUMERIC, TEXT, DATE, TEXT, TEXT, JSONB
) TO authenticated;

COMMENT ON FUNCTION public.wa_register_supplier_payment(
  UUID, UUID, NUMERIC, TEXT, DATE, TEXT, TEXT, JSONB
) IS
  'PROVEEDORES-CORE-2/2B: única vía de escritura de wa_supplier_payments y '
  'wa_supplier_payment_allocations. Bloquea las facturas referenciadas en '
  'p_allocations con SELECT ... FOR UPDATE en orden determinístico (ORDER BY '
  'id) antes de calcular saldo disponible -- dos pagos concurrentes nunca '
  'pueden sobreasignar la misma factura. CORE-2B: SUM(p_allocations.amount) '
  'debe ser EXACTAMENTE igual a p_amount -- un pago sin asignar o '
  'parcialmente asignado se rechaza (ALLOCATIONS_MUST_EQUAL_PAYMENT_AMOUNT); '
  'no existe anticipo/crédito a favor en esta versión. Nunca confía en '
  'business ownership ni en balances enviados por el cliente -- todo se '
  're-deriva server-side desde auth.uid() y desde las allocations ya '
  'existentes.';

NOTIFY pgrst, 'reload schema';
