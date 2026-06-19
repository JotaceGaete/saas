-- ============================================================
-- Enforce product plan limit at DB level (BEFORE INSERT trigger)
--
-- Replicates the JS logic in waBusinessService.js:
--   • getEffectivePlanSlug() → reads plan_slug, plan_expires_at,
--     trial_expires_at from wa_businesses.
--   • getActiveProductCount() → COUNT where status='active'
--     AND is_draft IS NOT TRUE AND business_id = NEW.business_id.
--   • Limits: starter=20, pro=100, business=unlimited.
--   • null/unknown plan_slug → treated as starter.
--
-- Safe to run multiple times (CREATE OR REPLACE + DROP IF EXISTS).
-- ============================================================


-- ── 1. Helper function: resolve effective plan slug ──────────────────────────
--
-- Mirrors getEffectivePlanSlug() + normalizePlanSlug() from JS:
--   - 'full' → 'business'
--   - pro/business active  → return as-is
--   - pro/business expired → 'starter'
--   - anything else        → 'starter'
--   - pro/business with no expires set at all → valid (admin legacy)

CREATE OR REPLACE FUNCTION public.wa_get_effective_plan_slug(
  p_plan_slug      TEXT,
  p_plan_expires_at TIMESTAMPTZ,
  p_trial_expires_at TIMESTAMPTZ
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  slug TEXT;
BEGIN
  -- Normalize
  slug := lower(trim(coalesce(p_plan_slug, '')));
  IF slug = 'full' THEN slug := 'business'; END IF;
  IF slug NOT IN ('pro', 'business') THEN RETURN 'starter'; END IF;

  -- Pro/business: check validity
  IF p_plan_expires_at IS NOT NULL AND p_plan_expires_at > now() THEN
    RETURN slug;
  END IF;
  IF p_trial_expires_at IS NOT NULL AND p_trial_expires_at > now() THEN
    RETURN slug;
  END IF;
  -- Both NULL → legacy admin plan, still valid
  IF p_plan_expires_at IS NULL AND p_trial_expires_at IS NULL THEN
    RETURN slug;
  END IF;

  RETURN 'starter';
END;
$$;


-- ── 2. Trigger function: enforce product limit ────────────────────────────────

CREATE OR REPLACE FUNCTION public.wa_enforce_product_plan_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  biz              RECORD;
  effective_plan   TEXT;
  max_products     INT;   -- NULL = unlimited
  active_count     INT;
BEGIN
  -- Only enforce when the incoming row is a visible (active, non-draft) product
  IF NEW.status IS DISTINCT FROM 'active' OR NEW.is_draft IS TRUE THEN
    RETURN NEW;
  END IF;

  -- Read business plan info
  SELECT plan_slug, plan_expires_at, trial_expires_at
    INTO biz
    FROM public.wa_businesses
   WHERE id = NEW.business_id;

  IF NOT FOUND THEN
    -- No business row → let the FK constraint handle it
    RETURN NEW;
  END IF;

  effective_plan := public.wa_get_effective_plan_slug(
    biz.plan_slug,
    biz.plan_expires_at,
    biz.trial_expires_at
  );

  -- Map plan to limit (NULL = unlimited)
  IF effective_plan = 'business' THEN
    RETURN NEW;  -- no limit, fast path
  ELSIF effective_plan = 'pro' THEN
    max_products := 100;
  ELSE
    -- starter (or any unknown slug)
    max_products := 20;
  END IF;

  -- Count current active products for this business (excluding NEW row)
  SELECT COUNT(*)
    INTO active_count
    FROM public.wa_products
   WHERE business_id = NEW.business_id
     AND status      = 'active'
     AND (is_draft IS NULL OR is_draft = FALSE);

  IF active_count >= max_products THEN
    RAISE EXCEPTION 'Límite de productos alcanzado para tu plan.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;


-- ── 3. Attach trigger to wa_products ─────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_enforce_product_plan_limit ON public.wa_products;

CREATE TRIGGER trg_enforce_product_plan_limit
  BEFORE INSERT
  ON public.wa_products
  FOR EACH ROW
  EXECUTE FUNCTION public.wa_enforce_product_plan_limit();
