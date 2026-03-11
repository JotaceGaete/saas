-- ============================================================
-- Admin: Pagos, suscripciones, notificaciones internas y auditoría
-- No rompe flujo MP. Preparado para email futuro.
-- ============================================================

-- 1. Notificaciones internas admin (sin correo por ahora)
CREATE TABLE IF NOT EXISTS public.wa_admin_notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type       TEXT        NOT NULL,   -- subscription_approved | renewal_approved | payment_rejected | webhook_error | duplicate_ignored | plan_expiring_soon | subscription_expired
  title      TEXT        NOT NULL,
  body       TEXT,
  payload    JSONB       NULL,       -- { business_id, payment_id, plan_slug, mp_payment_id, ... }
  read_at    TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_admin_notifications_created_at ON public.wa_admin_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_admin_notifications_read_at ON public.wa_admin_notifications(read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wa_admin_notifications_type ON public.wa_admin_notifications(type);

COMMENT ON TABLE public.wa_admin_notifications IS 'Notificaciones internas para panel admin. Sin email por ahora.';

ALTER TABLE public.wa_admin_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_admin_notifications_admin_select" ON public.wa_admin_notifications;
CREATE POLICY "wa_admin_notifications_admin_select"
  ON public.wa_admin_notifications FOR SELECT TO authenticated
  USING (public.wa_is_admin());

DROP POLICY IF EXISTS "wa_admin_notifications_admin_update" ON public.wa_admin_notifications;
CREATE POLICY "wa_admin_notifications_admin_update"
  ON public.wa_admin_notifications FOR UPDATE TO authenticated
  USING (public.wa_is_admin())
  WITH CHECK (public.wa_is_admin());

-- Inserts solo desde backend (service_role) o triggers
DROP POLICY IF EXISTS "wa_admin_notifications_service_insert" ON public.wa_admin_notifications;
CREATE POLICY "wa_admin_notifications_service_insert"
  ON public.wa_admin_notifications FOR INSERT TO authenticated
  WITH CHECK (public.wa_is_admin());
-- Nota: inserts desde Edge Functions usan service_role y no pasan por RLS. Para que un admin pueda crear notificaciones desde la app usamos WITH CHECK (wa_is_admin()). Para backend (cron/trigger) usamos service_role.

-- Permitir INSERT desde service_role vía función SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.wa_admin_notify(
  p_type TEXT,
  p_title TEXT,
  p_body TEXT DEFAULT NULL,
  p_payload JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
  DECLARE
    nid UUID;
  BEGIN
    INSERT INTO public.wa_admin_notifications (type, title, body, payload)
    VALUES (p_type, p_title, p_body, p_payload)
    RETURNING id INTO nid;
    RETURN nid;
  END;
$$;
COMMENT ON FUNCTION public.wa_admin_notify IS 'Inserta notificación admin. Llamar desde triggers o con role con permisos.';

-- 2. Auditoría de acciones manuales admin
CREATE TABLE IF NOT EXISTS public.wa_admin_audit_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action          TEXT        NOT NULL,   -- extend_plan | change_plan | activate_subscription | reprocess_webhook | ...
  entity_type     TEXT        NOT NULL,   -- business | payment
  entity_id       UUID        NOT NULL,
  payload         JSONB       NULL,       -- { previous_plan_slug, new_plan_slug, days_added, reason, ... }
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_admin_audit_log_created_at ON public.wa_admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_admin_audit_log_entity ON public.wa_admin_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_wa_admin_audit_log_admin ON public.wa_admin_audit_log(admin_user_id);

COMMENT ON TABLE public.wa_admin_audit_log IS 'Auditoría de acciones manuales en panel admin (cambios de plan, extensiones, etc.).';

ALTER TABLE public.wa_admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_admin_audit_log_admin_select" ON public.wa_admin_audit_log;
CREATE POLICY "wa_admin_audit_log_admin_select"
  ON public.wa_admin_audit_log FOR SELECT TO authenticated
  USING (public.wa_is_admin());

DROP POLICY IF EXISTS "wa_admin_audit_log_admin_insert" ON public.wa_admin_audit_log;
CREATE POLICY "wa_admin_audit_log_admin_insert"
  ON public.wa_admin_audit_log FOR INSERT TO authenticated
  WITH CHECK (public.wa_is_admin() AND auth.uid() = admin_user_id);

-- 3. Vista admin de pagos ampliada (origen, metadata, user_id)
DROP VIEW IF EXISTS public.wa_payments_admin_view;

CREATE VIEW public.wa_payments_admin_view AS
SELECT
  p.id,
  p.created_at,
  p.updated_at,
  p.status,
  p.plan_slug,
  p.amount,
  p.currency,
  p.mp_payment_id,
  p.mp_preference_id,
  p.mp_status,
  p.mp_status_detail,
  p.plan_activated_at,
  p.plan_expires_at,
  p.external_reference,
  p.user_id,
  p.metadata,
  CASE
    WHEN p.external_reference = 'internal_proration' OR (p.metadata->>'provider') = 'internal_proration' THEN 'internal'
    ELSE 'mercado_pago'
  END AS origin,
  b.id   AS business_id,
  b.name AS business_name,
  b.slug AS business_slug,
  b.plan_slug AS business_plan_slug,
  b.plan_expires_at AS business_plan_expires_at,
  u.email AS user_email
FROM public.wa_payments p
JOIN public.wa_businesses b ON b.id = p.business_id
LEFT JOIN auth.users u ON u.id = p.user_id
ORDER BY p.created_at DESC;

COMMENT ON VIEW public.wa_payments_admin_view IS 'Vista de pagos para panel admin. Incluye origen (mercado_pago | internal) y metadata.';

-- 4. Estadísticas para dashboard admin de pagos
CREATE OR REPLACE FUNCTION public.wa_admin_payments_stats(
  p_month_start TIMESTAMPTZ DEFAULT date_trunc('month', now())::timestamptz,
  p_month_end   TIMESTAMPTZ DEFAULT date_trunc('month', now())::timestamptz + interval '1 month'
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  DECLARE
    res JSONB;
    total_approved INT;
    total_pending INT;
    total_rejected INT;
    active_subs INT;
    expired_subs INT;
    revenue_month NUMERIC;
    recent_count INT;
  BEGIN
    IF NOT public.wa_is_admin() THEN
      RETURN jsonb_build_object('error', 'forbidden');
    END IF;

    SELECT COUNT(*)::INT INTO total_approved FROM public.wa_payments WHERE status = 'approved';
    SELECT COUNT(*)::INT INTO total_pending FROM public.wa_payments WHERE status = 'pending';
    SELECT COUNT(*)::INT INTO total_rejected FROM public.wa_payments WHERE status = 'rejected';

    SELECT COUNT(*)::INT INTO active_subs
    FROM public.wa_businesses b
    WHERE b.plan_slug IN ('control','pro','business') AND b.plan_expires_at IS NOT NULL AND b.plan_expires_at > now();

    SELECT COUNT(*)::INT INTO expired_subs
    FROM public.wa_businesses b
    WHERE b.plan_slug IN ('control','pro','business') AND b.plan_expires_at IS NOT NULL AND b.plan_expires_at <= now();

    SELECT COALESCE(SUM(amount), 0) INTO revenue_month
    FROM public.wa_payments
    WHERE status = 'approved' AND plan_activated_at >= p_month_start AND plan_activated_at < p_month_end;

    SELECT COUNT(*)::INT INTO recent_count
    FROM public.wa_payments
    WHERE status = 'approved' AND plan_activated_at >= (now() - interval '30 days');

    res := jsonb_build_object(
      'totalApproved', total_approved,
      'totalPending', total_pending,
      'totalRejected', total_rejected,
      'activeSubscriptions', active_subs,
      'expiredSubscriptions', expired_subs,
      'revenueThisMonth', revenue_month,
      'recentRenewalsCount', recent_count,
      'monthStart', p_month_start,
      'monthEnd', p_month_end
    );

    RETURN res;
  END;
$$;

COMMENT ON FUNCTION public.wa_admin_payments_stats IS 'Estadísticas de pagos/suscripciones para dashboard admin. Solo admins.';

-- Planes más vendidos (conteo por plan_slug de pagos aprobados)
CREATE OR REPLACE FUNCTION public.wa_admin_plans_sold()
RETURNS TABLE(plan_slug TEXT, count BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.plan_slug::TEXT, COUNT(*)::BIGINT
  FROM public.wa_payments p
  WHERE p.status = 'approved'
  GROUP BY p.plan_slug
  ORDER BY COUNT(*) DESC;
$$;

-- 5. Trigger: notificación cuando un pago pasa a approved o rejected
CREATE OR REPLACE FUNCTION public.wa_trigger_payment_status_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
  DECLARE
    bname TEXT;
    uemail TEXT;
  BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      IF NEW.status = 'approved' THEN
        SELECT b.name, u.email INTO bname, uemail
        FROM public.wa_businesses b
        LEFT JOIN auth.users u ON u.id = NEW.user_id
        WHERE b.id = NEW.business_id;
        PERFORM public.wa_admin_notify(
          'subscription_approved',
          'Pago aprobado',
          COALESCE(bname, 'Negocio') || ' – Plan ' || NEW.plan_slug || COALESCE(' (' || uemail || ')', ''),
          jsonb_build_object('payment_id', NEW.id, 'business_id', NEW.business_id, 'plan_slug', NEW.plan_slug, 'amount', NEW.amount, 'mp_payment_id', NEW.mp_payment_id)
        );
      ELSIF NEW.status = 'rejected' THEN
        SELECT b.name INTO bname FROM public.wa_businesses b WHERE b.id = NEW.business_id;
        PERFORM public.wa_admin_notify(
          'payment_rejected',
          'Pago rechazado',
          COALESCE(bname, 'Negocio') || ' – ' || COALESCE(NEW.mp_status_detail, 'rechazado'),
          jsonb_build_object('payment_id', NEW.id, 'business_id', NEW.business_id, 'plan_slug', NEW.plan_slug, 'mp_payment_id', NEW.mp_payment_id)
        );
      END IF;
    END IF;
    RETURN NEW;
  END;
$$;

DROP TRIGGER IF EXISTS wa_payment_status_notify ON public.wa_payments;
CREATE TRIGGER wa_payment_status_notify
  AFTER UPDATE ON public.wa_payments
  FOR EACH ROW EXECUTE FUNCTION public.wa_trigger_payment_status_notify();

-- 6. Acciones admin: extender plan y cambiar plan (con auditoría)
CREATE OR REPLACE FUNCTION public.wa_admin_extend_plan(
  p_business_id UUID,
  p_days INT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
  DECLARE
    biz RECORD;
    new_expires TIMESTAMPTZ;
  BEGIN
    IF NOT public.wa_is_admin() THEN
      RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
    END IF;
    IF p_days IS NULL OR p_days < 1 OR p_days > 365 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_days');
    END IF;

    SELECT id, plan_slug, plan_expires_at INTO biz
    FROM public.wa_businesses WHERE id = p_business_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'business_not_found');
    END IF;

    new_expires := COALESCE(biz.plan_expires_at, now()) + (p_days || ' days')::interval;
    IF new_expires < now() THEN
      new_expires := now() + (p_days || ' days')::interval;
    END IF;

    UPDATE public.wa_businesses
    SET plan_expires_at = new_expires, updated_at = now()
    WHERE id = p_business_id;

    INSERT INTO public.wa_admin_audit_log (admin_user_id, action, entity_type, entity_id, payload)
    VALUES (
      auth.uid(),
      'extend_plan',
      'business',
      p_business_id,
      jsonb_build_object('days_added', p_days, 'previous_expires', biz.plan_expires_at, 'new_expires', new_expires, 'reason', p_reason)
    );

    RETURN jsonb_build_object('ok', true, 'plan_expires_at', new_expires);
  END;
$$;

CREATE OR REPLACE FUNCTION public.wa_admin_change_plan(
  p_business_id UUID,
  p_new_plan_slug TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
  DECLARE
    biz RECORD;
  BEGIN
    IF NOT public.wa_is_admin() THEN
      RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
    END IF;
    IF p_new_plan_slug IS NULL OR p_new_plan_slug NOT IN ('starter','control','pro','business') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_plan');
    END IF;

    SELECT id, plan_slug, plan_expires_at INTO biz
    FROM public.wa_businesses WHERE id = p_business_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'business_not_found');
    END IF;

    UPDATE public.wa_businesses
    SET plan_slug = p_new_plan_slug,
        plan_expires_at = CASE WHEN p_new_plan_slug = 'starter' THEN NULL ELSE biz.plan_expires_at END,
        updated_at = now()
    WHERE id = p_business_id;

    INSERT INTO public.wa_admin_audit_log (admin_user_id, action, entity_type, entity_id, payload)
    VALUES (
      auth.uid(),
      'change_plan',
      'business',
      p_business_id,
      jsonb_build_object('previous_plan_slug', biz.plan_slug, 'new_plan_slug', p_new_plan_slug, 'reason', p_reason)
    );

    RETURN jsonb_build_object('ok', true, 'plan_slug', p_new_plan_slug);
  END;
$$;

NOTIFY pgrst, 'reload schema';
