-- Fixture mínimo para pruebas de acceso de wa_businesses / wa_payments.
-- Replica el estado ORIGINAL de producción (políticas y grants previos a la migración)
-- y las convenciones de Supabase: roles anon/authenticated/service_role, auth.uid(),
-- auth.role(), auth.jwt() leyendo request.jwt.claims, service_role con BYPASSRLS.
-- Solo para bases descartables. Nunca ejecutar contra producción.

\set ON_ERROR_STOP on

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
ALTER ROLE service_role BYPASSRLS;

DROP SCHEMA IF EXISTS auth CASCADE;
CREATE SCHEMA auth;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(auth.jwt() ->> 'role', '')
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.jwt(), auth.uid(), auth.role() TO anon, authenticated, service_role;

DROP TABLE IF EXISTS public.wa_payments;
DROP TABLE IF EXISTS public.wa_businesses;
DROP FUNCTION IF EXISTS public.wa_is_admin();
DROP FUNCTION IF EXISTS public.wa_get_effective_plan(text, timestamptz, timestamptz);

CREATE FUNCTION public.wa_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

CREATE FUNCTION public.wa_get_effective_plan(p_plan text, p_expires timestamptz, p_trial timestamptz)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN p_trial IS NOT NULL AND p_trial > now() THEN 'pro'
              ELSE coalesce(p_plan, 'starter') END
$$;

CREATE TABLE public.wa_businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text, description text, whatsapp text, email text, address text,
  city text, region text, country text, country_code text, currency text,
  logo_url text, cover_image_url text, design_settings jsonb, lat double precision, lng double precision,
  og_image_url text, slug text UNIQUE, is_active boolean DEFAULT true, rubro_id uuid,
  seo_family_key text, seo_content_override jsonb, seo_content_ai jsonb,
  instagram_url text, tiktok_url text, facebook_url text, print_legend text,
  document_title_type text, business_mode text, order_message_template text,
  ticket_logo_url text, operating_days jsonb, onboarding_step text,
  onboarding_completed_at timestamptz, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  plan_slug text DEFAULT 'starter', plan_started_at timestamptz, plan_expires_at timestamptz,
  trial_expires_at timestamptz, scheduled_plan_slug text, scheduled_change_at timestamptz, activated_at timestamptz
);

CREATE TABLE public.wa_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.wa_businesses(id),
  user_id uuid NOT NULL,
  amount integer NOT NULL DEFAULT 0
);

-- Estado original: privilegios por defecto de Supabase (anon/authenticated con todo).
GRANT ALL ON public.wa_businesses, public.wa_payments TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wa_is_admin(), public.wa_get_effective_plan(text, timestamptz, timestamptz) TO anon, authenticated, service_role;

ALTER TABLE public.wa_businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_payments ENABLE ROW LEVEL SECURITY;

-- Políticas originales de producción (nombres y expresiones).
CREATE POLICY wa_businesses_public_read ON public.wa_businesses FOR SELECT TO public USING (true);
CREATE POLICY wa_businesses_owner_all ON public.wa_businesses FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY wa_businesses_owner_insert ON public.wa_businesses FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY wa_businesses_admin_select ON public.wa_businesses FOR SELECT TO authenticated
  USING (public.wa_is_admin());
CREATE POLICY wa_payments_owner_select ON public.wa_payments FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY wa_payments_admin_select ON public.wa_payments FOR SELECT TO authenticated
  USING (public.wa_is_admin());

-- Datos: dos dueños (A y B) y un admin. Insertados como postgres (bypass).
INSERT INTO public.wa_businesses (id, user_id, name, slug, email, whatsapp, plan_slug, plan_expires_at, trial_expires_at, scheduled_plan_slug)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Negocio A', 'negocio-a', 'a@example.test', '+56900000001', 'pro', now() + interval '10 days', now() + interval '10 days', 'starter'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'Negocio B', 'negocio-b', 'b@example.test', '+56900000002', 'enterprise', NULL, NULL, NULL);

INSERT INTO public.wa_payments (business_id, user_id, amount) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 1000),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 2000),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 3000);

-- Helpers de prueba (solo en la base descartable).
CREATE OR REPLACE FUNCTION public.t_expect_denied(q text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE q;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS (denied): %', label;
    RETURN;
  END;
  RAISE EXCEPTION 'FAIL (allowed but must be denied): %', label;
END $$;

CREATE OR REPLACE FUNCTION public.t_expect_allowed(q text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE q;
  RAISE NOTICE 'PASS (allowed): %', label;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE EXCEPTION 'FAIL (denied but must be allowed): % -> %', label, SQLERRM;
END $$;

CREATE OR REPLACE FUNCTION public.t_expect_count(q text, expected bigint, label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  EXECUTE 'SELECT count(*) FROM (' || q || ') s' INTO n;
  IF n IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'FAIL (count %, expected %): %', n, expected, label;
  END IF;
  RAISE NOTICE 'PASS (count %): %', n, label;
EXCEPTION WHEN insufficient_privilege THEN
  IF expected = -1 THEN RAISE NOTICE 'PASS (denied): %', label; RETURN; END IF;
  RAISE EXCEPTION 'FAIL (denied but must be allowed): % -> %', label, SQLERRM;
END $$;

GRANT EXECUTE ON FUNCTION public.t_expect_denied(text, text), public.t_expect_allowed(text, text),
  public.t_expect_count(text, bigint, text) TO anon, authenticated, service_role;
