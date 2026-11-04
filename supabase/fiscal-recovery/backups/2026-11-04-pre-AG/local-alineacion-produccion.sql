-- Alineación de una base LOCAL de prueba con producción (capturado 2026-11-04, solo estructura, sin datos).
-- Uso: sobre una base *_test construida como en localdb/build.sh hasta P0. Nunca en producción.
-- Incluye: permisos reales del esquema fiscal, objetos de alta de negocio/producto de producción y permisos de esquemas de Supabase.
-- Permisos de producción sobre el esquema fiscal (capturados 2026-11-04). Solo base LOCAL.
begin;
revoke all on all tables in schema fiscal from service_role;
revoke all on all sequences in schema fiscal from service_role;
grant select, insert, update, delete on fiscal.admin_audit to service_role;
grant select, insert, update, delete on fiscal.business_fiscal_roles to service_role;
grant select, insert, update on fiscal.issuers to service_role;
grant select, insert, update on fiscal.operations to service_role;
grant select, insert, update on fiscal.line_tax_verifications to service_role;
grant usage, select on all sequences in schema fiscal to service_role;
revoke all on function fiscal.enqueue_paid_pos_dte39() from public, service_role;
revoke all on function fiscal.protect_dte39_outbox_transition() from public, service_role;
commit;

grant usage on schema extensions, auth to anon, authenticated, service_role;
grant execute on all functions in schema extensions to anon, authenticated, service_role;
-- Alineación LOCAL con producción (solo estructura, sin datos). Nunca se ejecuta en producción.
begin;
create table if not exists public.email_queue (
  id uuid not null default gen_random_uuid(), to_email text not null, to_name text, template text not null, subject text,
  payload jsonb not null default '{}'::jsonb, status text not null default 'pending'::text, retry_count integer not null default 0,
  max_retries integer not null default 3, next_attempt_at timestamp with time zone not null default now(), sent_at timestamp with time zone,
  last_error text, provider text default 'resend'::text, provider_message_id text, created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(), user_id uuid, business_id uuid, type text, event_key text, claimed_at timestamp with time zone,
  constraint email_queue_pkey primary key (id),
  constraint email_queue_status_check check ((status = any (array['pending'::text, 'processing'::text, 'sent'::text, 'failed'::text]))));
create unique index if not exists email_queue_unique_welcome on public.email_queue using btree (to_email, template) where (template = 'welcome'::text);
create unique index if not exists idx_email_queue_business_type on public.email_queue using btree (business_id, type) where (type <> all (array['payment_received_buyer'::text, 'payment_received_merchant'::text]));
create index if not exists email_queue_pending_idx on public.email_queue using btree (status, next_attempt_at) where (status = any (array['pending'::text, 'failed'::text]));
create unique index if not exists idx_email_queue_event_key on public.email_queue using btree (event_key) where (event_key is not null);
create index if not exists idx_email_queue_next_attempt_status on public.email_queue using btree (next_attempt_at) where (status = any (array['pending'::text, 'failed'::text]));
create index if not exists idx_email_queue_processing_claimed_at on public.email_queue using btree (claimed_at) where (status = 'processing'::text);
alter table public.email_queue enable row level security;
grant all on public.email_queue to anon, authenticated, service_role;

create table if not exists public.admin_alert_queue (
  id uuid not null default gen_random_uuid(), type text not null, status text not null default 'pending'::text, payload jsonb, error text,
  retry_count integer not null default 0, sent_at timestamp with time zone, created_at timestamp with time zone not null default now(),
  next_attempt_at timestamp with time zone,
  constraint admin_alert_queue_pkey primary key (id),
  constraint admin_alert_queue_status_check check ((status = any (array['pending'::text, 'sent'::text, 'failed'::text]))));
create index if not exists idx_admin_alert_queue_pending on public.admin_alert_queue using btree (created_at) where (status = 'pending'::text);
create index if not exists idx_admin_alert_queue_next_attempt_status on public.admin_alert_queue using btree (next_attempt_at) where (status = any (array['pending'::text, 'failed'::text]));
alter table public.admin_alert_queue enable row level security;
grant all on public.admin_alert_queue to anon, authenticated, service_role;

-- wa_businesses: columnas, restricciones y triggers de producción
alter table public.wa_businesses add column if not exists activated_at timestamp with time zone;
alter table public.wa_businesses add column if not exists onboarding_completed_at timestamp with time zone;
alter table public.wa_businesses add column if not exists onboarding_step text not null default 'business_basics'::text;
alter table public.wa_businesses add column if not exists ticket_logo_url text;
alter table public.wa_businesses drop constraint if exists wa_businesses_country_code_check;
alter table public.wa_businesses add constraint wa_businesses_country_code_check CHECK (((country_code IS NULL) OR (country_code = ANY (ARRAY['AR'::text, 'BO'::text, 'BR'::text, 'CL'::text, 'CO'::text, 'CR'::text, 'EC'::text, 'GT'::text, 'MX'::text, 'PA'::text, 'PE'::text, 'PY'::text, 'UY'::text, 'NI'::text]))));
alter table public.wa_businesses drop constraint if exists wa_businesses_onboarding_step_check;
alter table public.wa_businesses add constraint wa_businesses_onboarding_step_check CHECK ((onboarding_step = ANY (ARRAY['business_basics'::text, 'first_product'::text, 'preview'::text, 'completed'::text])));
CREATE OR REPLACE FUNCTION public.wa_queue_new_user_alert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email text;
BEGIN
  v_email := COALESCE(
    NULLIF(trim(NEW.email), ''),
    (SELECT email FROM auth.users WHERE id = NEW.user_id LIMIT 1),
    'sin-email'
  );

  INSERT INTO public.admin_alert_queue (type, payload)
  VALUES (
    'new_user',
    jsonb_build_object(
      'user_email',    v_email,
      'business_name', COALESCE(NULLIF(trim(NEW.name), ''), 'Sin nombre'),
      'business_id',   NEW.id,
      'created_at',    now()
    )
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'wa_queue_new_user_alert failed for business %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.wa_queue_onboarding_tips()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email       text;
  v_name        text;
  v_tip_num     int;
  v_type        text;
  v_delay       interval;
BEGIN
  -- Resolver email del usuario
  v_email := COALESCE(
    NULLIF(trim(NEW.email), ''),
    (SELECT email FROM auth.users WHERE id = NEW.user_id LIMIT 1)
  );

  IF v_email IS NULL THEN
    RAISE WARNING 'wa_queue_onboarding_tips: sin email para business %, saltando', NEW.id;
    RETURN NEW;
  END IF;

  v_name := COALESCE(NULLIF(trim(NEW.name), ''), split_part(v_email, '@', 1));

  -- Insertar 10 tips con next_attempt_at escalonado
  FOR v_tip_num IN 1..10 LOOP
    v_type := 'onboarding_tip_' || lpad(v_tip_num::text, 2, '0');

    -- tip_01 = +24h, tip_02..tip_10 = +N days
    IF v_tip_num = 1 THEN
      v_delay := interval '24 hours';
    ELSE
      v_delay := make_interval(days => v_tip_num);
    END IF;

    INSERT INTO public.email_queue (
      user_id,
      business_id,
      type,
      template,
      to_email,
      subject,
      payload,
      next_attempt_at,
      status,
      retry_count
    )
    VALUES (
      NEW.user_id,
      NEW.id,
      v_type,
      v_type,
      v_email,
      NULL,          -- el template JS genera el subject
      jsonb_build_object(
        'name',          NULLIF(trim(NEW.name), ''),
        'business_name', v_name,
        'user_email',    v_email,
        'created_at',    now()
      ),
      now() + v_delay,
      'pending',
      0
    )
    ON CONFLICT (business_id, type) DO NOTHING;

  END LOOP;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'wa_queue_onboarding_tips failed for business %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.wa_check_product_limit(p_business_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan          TEXT;
  v_expires       TIMESTAMPTZ;
  v_trial_expires TIMESTAMPTZ;
  v_eff_plan      TEXT;
  v_max           INT;
  v_active_cnt    INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.wa_businesses
    WHERE id = p_business_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT plan_slug, plan_expires_at, trial_expires_at
    INTO v_plan, v_expires, v_trial_expires
    FROM public.wa_businesses
   WHERE id = p_business_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  v_eff_plan := public.wa_get_effective_plan(v_plan, v_expires, v_trial_expires);
  v_max      := public.wa_plan_max_products(v_eff_plan);
  IF v_max IS NULL THEN RETURN TRUE; END IF;

  SELECT COUNT(*) INTO v_active_cnt
    FROM public.wa_products
   WHERE business_id = p_business_id AND status = 'active';

  RETURN v_active_cnt < v_max;
END;
$function$;
CREATE OR REPLACE FUNCTION public.wa_enforce_product_plan_limit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  biz            RECORD;
  effective_plan TEXT;
  max_products   INT;
  active_count   INT;
BEGIN
  IF NEW.status IS DISTINCT FROM 'active' OR NEW.is_draft IS TRUE THEN RETURN NEW; END IF;
  SELECT plan_slug, plan_expires_at, trial_expires_at INTO biz
    FROM public.wa_businesses WHERE id = NEW.business_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  effective_plan := public.wa_get_effective_plan_slug(biz.plan_slug, biz.plan_expires_at, biz.trial_expires_at);
  IF effective_plan = 'business' THEN RETURN NEW; END IF;
  IF effective_plan = 'pro' THEN max_products := 100; ELSE max_products := 20; END IF;
  SELECT COUNT(*) INTO active_count
    FROM public.wa_products
   WHERE business_id = NEW.business_id
     AND status = 'active'
     AND (is_draft IS NULL OR is_draft = FALSE);
  IF active_count >= max_products THEN
    RAISE EXCEPTION 'Límite de productos alcanzado para tu plan.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.wa_fill_business_email_from_auth()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  owner_email text;
BEGIN
  IF NEW.email IS NULL OR btrim(NEW.email) = '' THEN
    SELECT email
    INTO owner_email
    FROM auth.users
    WHERE id = NEW.user_id;

    IF owner_email IS NOT NULL AND btrim(owner_email) <> '' THEN
      NEW.email := owner_email;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.wa_get_effective_plan_slug(p_plan_slug text, p_plan_expires_at timestamp with time zone, p_trial_expires_at timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE slug TEXT;
BEGIN
  slug := lower(trim(coalesce(p_plan_slug, '')));
  IF slug = 'full' THEN slug := 'business'; END IF;
  IF slug NOT IN ('pro', 'business') THEN RETURN 'starter'; END IF;
  IF p_plan_expires_at IS NOT NULL AND p_plan_expires_at > now() THEN RETURN slug; END IF;
  IF p_trial_expires_at IS NOT NULL AND p_trial_expires_at > now() THEN RETURN slug; END IF;
  IF p_plan_expires_at IS NULL AND p_trial_expires_at IS NULL THEN RETURN slug; END IF;
  RETURN 'starter';
END;
$function$;
CREATE OR REPLACE FUNCTION public.wa_plan_max_products(p_plan text)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN CASE p_plan
    WHEN 'pro'      THEN 100
    WHEN 'business' THEN NULL
    WHEN 'full'     THEN NULL
    ELSE 20
  END;
END;
$function$;
CREATE OR REPLACE FUNCTION public.wa_products_assign_slug()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  base_slug TEXT;
  candidate TEXT;
  counter INTEGER := 2;
BEGIN
  IF NEW.slug IS NULL OR trim(NEW.slug) = '' THEN
    base_slug := public.wa_slugify_product_name(NEW.name);
  ELSIF TG_OP = 'UPDATE' AND NEW.name IS DISTINCT FROM OLD.name AND NEW.slug = OLD.slug THEN
    base_slug := public.wa_slugify_product_name(NEW.name);
  ELSE
    base_slug := public.wa_slugify_product_name(NEW.slug);
  END IF;

  candidate := base_slug;
  WHILE EXISTS (
    SELECT 1
    FROM public.wa_products p
    WHERE p.business_id = NEW.business_id
      AND p.slug = candidate
      AND p.id <> NEW.id
  ) LOOP
    candidate := base_slug || '-' || counter;
    counter := counter + 1;
  END LOOP;

  NEW.slug := candidate;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.wa_queue_first_product_added_lifecycle_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  business_row public.wa_businesses%ROWTYPE;
  product_count INTEGER;
BEGIN
  IF NEW.business_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)
  INTO product_count
  FROM public.wa_products
  WHERE business_id = NEW.business_id;

  IF product_count <> 1 THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO business_row
  FROM public.wa_businesses
  WHERE id = NEW.business_id;

  IF business_row.id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.wa_lifecycle_events (
    event_name,
    user_id,
    business_id,
    payload
  )
  VALUES (
    'first_product_added',
    business_row.user_id,
    NEW.business_id,
    jsonb_build_object(
      'business_name', business_row.name
    )
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.wa_slugify_product_name(input text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  out TEXT;
BEGIN
  out := lower(extensions.unaccent(coalesce(input, '')));
  out := regexp_replace(out, '[^a-z0-9]+', '-', 'g');
  out := trim(both '-' from out);
  IF out = '' THEN
    out := 'producto';
  END IF;
  RETURN out;
END;
$function$;
drop trigger if exists trigger_queue_new_user_alert on public.wa_businesses;
CREATE TRIGGER trigger_queue_new_user_alert AFTER INSERT ON public.wa_businesses FOR EACH ROW EXECUTE FUNCTION wa_queue_new_user_alert();
drop trigger if exists trigger_queue_onboarding_tips on public.wa_businesses;
CREATE TRIGGER trigger_queue_onboarding_tips AFTER INSERT ON public.wa_businesses FOR EACH ROW EXECUTE FUNCTION wa_queue_onboarding_tips();
drop trigger if exists wa_businesses_fill_email_from_auth on public.wa_businesses;
CREATE TRIGGER wa_businesses_fill_email_from_auth BEFORE INSERT OR UPDATE ON public.wa_businesses FOR EACH ROW EXECUTE FUNCTION wa_fill_business_email_from_auth();
-- wa_products: índices de producción
CREATE INDEX IF NOT EXISTS idx_wa_products_business_barcode ON public.wa_products USING btree (business_id, barcode) WHERE (barcode IS NOT NULL);
CREATE INDEX IF NOT EXISTS wa_products_business_barcode_idx ON public.wa_products USING btree (business_id, barcode);
CREATE UNIQUE INDEX IF NOT EXISTS wa_products_business_barcode_uq ON public.wa_products USING btree (business_id, barcode) WHERE ((barcode IS NOT NULL) AND (barcode <> ''::text));
CREATE UNIQUE INDEX IF NOT EXISTS wa_products_business_id_slug_key ON public.wa_products USING btree (business_id, slug) WHERE (slug IS NOT NULL);
CREATE INDEX IF NOT EXISTS wa_products_business_sku_idx ON public.wa_products USING btree (business_id, sku);
-- Permisos de funciones como en producción
do $$ declare f text; begin
  foreach f in array array['public.wa_enforce_product_plan_limit()','public.wa_fill_business_email_from_auth()',
    'public.wa_get_effective_plan_slug(text,timestamp with time zone,timestamp with time zone)','public.wa_products_assign_slug()',
    'public.wa_queue_first_product_added_lifecycle_event()','public.wa_queue_new_user_alert()','public.wa_queue_onboarding_tips()',
    'public.wa_slugify_product_name(text)'] loop
    execute format('grant execute on function %s to public, anon, authenticated, service_role', f);
  end loop;
end $$;
revoke all on function public.wa_check_product_limit(uuid) from public, anon;
grant execute on function public.wa_check_product_limit(uuid) to authenticated, service_role;
revoke all on function public.wa_plan_max_products(text) from public, anon, authenticated;
grant execute on function public.wa_plan_max_products(text) to service_role;
commit;
