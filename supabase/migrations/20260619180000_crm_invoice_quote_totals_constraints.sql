-- ============================================================
-- crm_invoices, crm_invoice_items, crm_quotes, crm_quote_items:
-- CHECKs defensivos de totales y precios
--
-- Objetivo: impedir valores absurdos vía API directa.
-- NO recalcula totales — solo rechaza negativos e inconsistencias
-- flagrantes (discount > subtotal, total > subtotal).
--
-- Todos los constraints son idempotentes (verifican pg_constraint).
-- Antes de cada ADD CONSTRAINT se verifica que ninguna fila existente
-- lo violaría — si hay violaciones, la migración se detiene con un
-- mensaje claro antes de hacer ningún cambio.
--
-- CHECKs ya existentes (no se duplican):
--   crm_quote_items.quantity   > 0
--   crm_invoice_items.quantity > 0
--   crm_quote_items.discount_pct   >= 0 AND <= 100
--   crm_invoice_items.discount_pct >= 0 AND <= 100
-- ============================================================


-- ── Pre-flight: detectar violaciones antes de modificar nada ─────────────────

DO $$
DECLARE
  v_count INT;
BEGIN
  -- crm_invoices: subtotal < 0
  SELECT COUNT(*) INTO v_count FROM public.crm_invoices WHERE subtotal < 0;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED: % filas en crm_invoices tienen subtotal < 0. Corregir antes de aplicar la migración.', v_count;
  END IF;

  -- crm_invoices: discount_amount < 0
  SELECT COUNT(*) INTO v_count FROM public.crm_invoices WHERE discount_amount < 0;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED: % filas en crm_invoices tienen discount_amount < 0.', v_count;
  END IF;

  -- crm_invoices: total < 0
  SELECT COUNT(*) INTO v_count FROM public.crm_invoices WHERE total < 0;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED: % filas en crm_invoices tienen total < 0.', v_count;
  END IF;

  -- crm_invoices: discount_amount > subtotal + 1
  SELECT COUNT(*) INTO v_count FROM public.crm_invoices WHERE discount_amount > subtotal + 1;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED: % filas en crm_invoices tienen discount_amount > subtotal + 1.', v_count;
  END IF;

  -- crm_invoices: total > subtotal + 1
  SELECT COUNT(*) INTO v_count FROM public.crm_invoices WHERE total > subtotal + 1;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED: % filas en crm_invoices tienen total > subtotal + 1.', v_count;
  END IF;

  -- crm_invoice_items: subtotal < 0
  SELECT COUNT(*) INTO v_count FROM public.crm_invoice_items WHERE subtotal < 0;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED: % filas en crm_invoice_items tienen subtotal < 0.', v_count;
  END IF;

  -- crm_invoice_items: unit_price < 0
  SELECT COUNT(*) INTO v_count FROM public.crm_invoice_items WHERE unit_price < 0;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED: % filas en crm_invoice_items tienen unit_price < 0.', v_count;
  END IF;

  -- crm_quotes: subtotal < 0
  SELECT COUNT(*) INTO v_count FROM public.crm_quotes WHERE subtotal < 0;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED: % filas en crm_quotes tienen subtotal < 0.', v_count;
  END IF;

  -- crm_quotes: discount_amount < 0
  SELECT COUNT(*) INTO v_count FROM public.crm_quotes WHERE discount_amount < 0;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED: % filas en crm_quotes tienen discount_amount < 0.', v_count;
  END IF;

  -- crm_quotes: total < 0
  SELECT COUNT(*) INTO v_count FROM public.crm_quotes WHERE total < 0;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED: % filas en crm_quotes tienen total < 0.', v_count;
  END IF;

  -- crm_quotes: discount_amount > subtotal + 1
  SELECT COUNT(*) INTO v_count FROM public.crm_quotes WHERE discount_amount > subtotal + 1;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED: % filas en crm_quotes tienen discount_amount > subtotal + 1.', v_count;
  END IF;

  -- crm_quotes: total > subtotal + 1
  SELECT COUNT(*) INTO v_count FROM public.crm_quotes WHERE total > subtotal + 1;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED: % filas en crm_quotes tienen total > subtotal + 1.', v_count;
  END IF;

  -- crm_quote_items: subtotal < 0
  SELECT COUNT(*) INTO v_count FROM public.crm_quote_items WHERE subtotal < 0;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED: % filas en crm_quote_items tienen subtotal < 0.', v_count;
  END IF;

  -- crm_quote_items: unit_price < 0
  SELECT COUNT(*) INTO v_count FROM public.crm_quote_items WHERE unit_price < 0;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED: % filas en crm_quote_items tienen unit_price < 0.', v_count;
  END IF;

  RAISE NOTICE 'Pre-flight OK: sin violaciones en datos existentes.';
END $$;


-- ── crm_invoices ─────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_crm_invoices_subtotal_non_negative'       AND conrelid = 'public.crm_invoices'::regclass) THEN
    ALTER TABLE public.crm_invoices ADD CONSTRAINT chk_crm_invoices_subtotal_non_negative       CHECK (subtotal >= 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_crm_invoices_discount_non_negative'      AND conrelid = 'public.crm_invoices'::regclass) THEN
    ALTER TABLE public.crm_invoices ADD CONSTRAINT chk_crm_invoices_discount_non_negative      CHECK (discount_amount >= 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_crm_invoices_total_non_negative'         AND conrelid = 'public.crm_invoices'::regclass) THEN
    ALTER TABLE public.crm_invoices ADD CONSTRAINT chk_crm_invoices_total_non_negative         CHECK (total >= 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_crm_invoices_discount_le_subtotal'       AND conrelid = 'public.crm_invoices'::regclass) THEN
    ALTER TABLE public.crm_invoices ADD CONSTRAINT chk_crm_invoices_discount_le_subtotal       CHECK (discount_amount <= subtotal + 1);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_crm_invoices_total_le_subtotal'          AND conrelid = 'public.crm_invoices'::regclass) THEN
    ALTER TABLE public.crm_invoices ADD CONSTRAINT chk_crm_invoices_total_le_subtotal          CHECK (total <= subtotal + 1);
  END IF;
END $$;


-- ── crm_invoice_items ────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_crm_invoice_items_subtotal_non_negative' AND conrelid = 'public.crm_invoice_items'::regclass) THEN
    ALTER TABLE public.crm_invoice_items ADD CONSTRAINT chk_crm_invoice_items_subtotal_non_negative CHECK (subtotal >= 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_crm_invoice_items_unit_price_non_negative' AND conrelid = 'public.crm_invoice_items'::regclass) THEN
    ALTER TABLE public.crm_invoice_items ADD CONSTRAINT chk_crm_invoice_items_unit_price_non_negative CHECK (unit_price >= 0);
  END IF;
END $$;


-- ── crm_quotes ───────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_crm_quotes_subtotal_non_negative'        AND conrelid = 'public.crm_quotes'::regclass) THEN
    ALTER TABLE public.crm_quotes ADD CONSTRAINT chk_crm_quotes_subtotal_non_negative        CHECK (subtotal >= 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_crm_quotes_discount_non_negative'        AND conrelid = 'public.crm_quotes'::regclass) THEN
    ALTER TABLE public.crm_quotes ADD CONSTRAINT chk_crm_quotes_discount_non_negative        CHECK (discount_amount >= 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_crm_quotes_total_non_negative'           AND conrelid = 'public.crm_quotes'::regclass) THEN
    ALTER TABLE public.crm_quotes ADD CONSTRAINT chk_crm_quotes_total_non_negative           CHECK (total >= 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_crm_quotes_discount_le_subtotal'         AND conrelid = 'public.crm_quotes'::regclass) THEN
    ALTER TABLE public.crm_quotes ADD CONSTRAINT chk_crm_quotes_discount_le_subtotal         CHECK (discount_amount <= subtotal + 1);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_crm_quotes_total_le_subtotal'            AND conrelid = 'public.crm_quotes'::regclass) THEN
    ALTER TABLE public.crm_quotes ADD CONSTRAINT chk_crm_quotes_total_le_subtotal            CHECK (total <= subtotal + 1);
  END IF;
END $$;


-- ── crm_quote_items ──────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_crm_quote_items_subtotal_non_negative'   AND conrelid = 'public.crm_quote_items'::regclass) THEN
    ALTER TABLE public.crm_quote_items ADD CONSTRAINT chk_crm_quote_items_subtotal_non_negative   CHECK (subtotal >= 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_crm_quote_items_unit_price_non_negative' AND conrelid = 'public.crm_quote_items'::regclass) THEN
    ALTER TABLE public.crm_quote_items ADD CONSTRAINT chk_crm_quote_items_unit_price_non_negative CHECK (unit_price >= 0);
  END IF;
END $$;
