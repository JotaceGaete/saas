-- ============================================================
-- crm_cash_movements: movimientos operativos de caja
--
-- Tabla separada de crm_payments (cobros comerciales).
-- Registra ingresos y egresos manuales: retiros del dueño,
-- depósitos bancarios, gastos pagados con efectivo de caja,
-- fondos adicionales, ajustes, etc.
--
-- Categorías de egreso (direction='out'):
--   owner_withdrawal  — Retiro del dueño (no es gasto)
--   bank_deposit      — Depósito bancario (no es gasto)
--   supplies          — Suministros (gasto)
--   utilities         — Servicios básicos (gasto)
--   rent              — Arriendo (gasto)
--   services          — Servicios (gasto)
--   taxes             — Impuestos (gasto)
--   salaries          — Sueldos / Comisiones (gasto)
--   other_expense     — Otro gasto (gasto)
--   other             — Otro sin categoría (no es gasto)
--
-- Categorías de ingreso (direction='in'):
--   cash_fund         — Fondo de caja adicional
--   correction        — Corrección / Ajuste
--   other             — Otro
--
-- Fase 2 (futura): is_expense=TRUE disparará la creación
-- automática de un crm_cost_item con source='cash_outflow'.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.crm_cash_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  session_id      UUID             REFERENCES public.crm_cash_sessions(id) ON DELETE SET NULL,
  movement_date   DATE    NOT NULL DEFAULT CURRENT_DATE,

  direction       TEXT    NOT NULL CHECK (direction IN ('in', 'out')),
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  reason          TEXT    NOT NULL,
  category        TEXT    NOT NULL DEFAULT 'other' CHECK (
    category IN (
      'owner_withdrawal', 'bank_deposit',
      'supplies', 'utilities', 'rent', 'services', 'taxes', 'salaries',
      'other_expense', 'cash_fund', 'correction', 'other'
    )
  ),
  payment_method  TEXT    NOT NULL DEFAULT 'cash',
  notes           TEXT,

  -- Fase 2: vinculación con gastos (columnas listas, lógica pendiente)
  is_expense      BOOLEAN NOT NULL DEFAULT FALSE,
  cost_item_id    UUID             REFERENCES public.crm_cost_items(id) ON DELETE SET NULL,

  -- Soft delete — mismo patrón que crm_payments
  voided_at       TIMESTAMPTZ,
  voided_by       UUID             REFERENCES auth.users(id) ON DELETE SET NULL,
  void_reason     TEXT,

  -- Auditoría
  created_by      UUID             REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Índices ────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_crm_cash_movements_business_id
  ON public.crm_cash_movements (business_id);

CREATE INDEX IF NOT EXISTS idx_crm_cash_movements_session_id
  ON public.crm_cash_movements (session_id);

CREATE INDEX IF NOT EXISTS idx_crm_cash_movements_business_date
  ON public.crm_cash_movements (business_id, movement_date);

CREATE INDEX IF NOT EXISTS idx_crm_cash_movements_voided_at
  ON public.crm_cash_movements (voided_at)
  WHERE voided_at IS NOT NULL;

-- ── Row Level Security ─────────────────────────────────────────────────────────

ALTER TABLE public.crm_cash_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_cash_movements_select" ON public.crm_cash_movements;
CREATE POLICY "crm_cash_movements_select"
  ON public.crm_cash_movements FOR SELECT TO authenticated
  USING (business_id IN (
    SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "crm_cash_movements_insert" ON public.crm_cash_movements;
CREATE POLICY "crm_cash_movements_insert"
  ON public.crm_cash_movements FOR INSERT TO authenticated
  WITH CHECK (business_id IN (
    SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "crm_cash_movements_update" ON public.crm_cash_movements;
CREATE POLICY "crm_cash_movements_update"
  ON public.crm_cash_movements FOR UPDATE TO authenticated
  USING  (business_id IN (SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "crm_cash_movements_delete" ON public.crm_cash_movements;
CREATE POLICY "crm_cash_movements_delete"
  ON public.crm_cash_movements FOR DELETE TO authenticated
  USING (business_id IN (
    SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
  ));
