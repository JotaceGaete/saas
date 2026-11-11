-- Pruebas de acceso de wa_businesses / wa_payments por rol.
-- Requiere fixture cargado (wa-businesses-access-fixture.sql). Cada bloque cambia de rol
-- con SET ROLE real; un FAIL aborta la ejecución (ON_ERROR_STOP).
\set ON_ERROR_STOP on

-- Identidades del fixture:
--   dueño A  = 11111111-1111-4111-8111-111111111111 (negocio aaaa…)
--   dueño B  = 22222222-2222-4222-8222-222222222222 (negocio bbbb…)
--   admin    = 33333333-3333-4333-8333-333333333333 (app_metadata.role = admin)

-- ── ANON ─────────────────────────────────────────────────────────────────────
SET ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', false);
SELECT public.t_expect_count('select id, name, slug, whatsapp from public.wa_businesses', 2, 'anon lee columnas públicas del catálogo');
SELECT public.t_expect_denied('select email from public.wa_businesses', 'anon no lee email');
SELECT public.t_expect_denied('select plan_slug from public.wa_businesses', 'anon no lee plan_slug');
SELECT public.t_expect_denied('select trial_expires_at from public.wa_businesses', 'anon no lee trial_expires_at');
SELECT public.t_expect_denied('select * from public.wa_businesses', 'anon no puede select *');
SELECT public.t_expect_denied($$update public.wa_businesses set name = 'x'$$, 'anon no puede UPDATE wa_businesses');
SELECT public.t_expect_denied($$insert into public.wa_businesses (user_id, name) values (gen_random_uuid(), 'x')$$, 'anon no puede INSERT wa_businesses');
SELECT public.t_expect_count('select id from public.wa_payments', 0, 'anon ve 0 pagos (RLS sin política)');
SELECT public.t_expect_denied($$update public.wa_payments set amount = 0$$, 'anon no puede UPDATE wa_payments');
SELECT public.t_expect_denied($$select * from public.wa_get_business_billing('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$, 'anon no puede RPC billing');
SELECT public.t_expect_denied($$select * from public.wa_admin_list_business_billing()$$, 'anon no puede RPC admin list');
SELECT public.t_expect_count($$select public.wa_get_business_effective_plan('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') as p$$, 1, 'anon puede consultar plan efectivo (sin fechas)');
RESET ROLE;

-- ── DUEÑO A (usuario autenticado normal) ─────────────────────────────────────
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', false);
SELECT public.t_expect_count('select id, name from public.wa_businesses', 2, 'autenticado ve negocios ajenos solo en columnas públicas (catálogo)');
SELECT public.t_expect_denied('select email from public.wa_businesses', 'autenticado no lee email de otros negocios');
SELECT public.t_expect_denied('select plan_slug from public.wa_businesses', 'autenticado no lee plan_slug de otros negocios');
SELECT public.t_expect_denied('select * from public.wa_businesses', 'autenticado no puede select * (incluye columnas privadas)');
SELECT public.t_expect_count('select id from public.wa_businesses where user_id = auth.uid()', 1, 'autenticado ve su propio negocio');
SELECT public.t_expect_count($$select * from public.wa_get_business_billing('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$, 1, 'dueño A obtiene su propia facturación por RPC');
SELECT public.t_expect_count($$select * from public.wa_get_business_billing('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$$, 0, 'dueño A NO obtiene facturación de B por RPC');
SELECT public.t_expect_denied($$select * from public.wa_admin_list_business_billing()$$, 'dueño A no puede listar facturación de todos (admin)');
SELECT public.t_expect_count($$select public.wa_get_business_effective_plan('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') as p$$, 1, 'dueño A ve plan efectivo de B (sin fechas)');
SELECT public.t_expect_allowed($$update public.wa_businesses set name = 'Negocio A renombrado' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'dueño A puede editar campos no sensibles de su negocio');
SELECT public.t_expect_denied($$update public.wa_businesses set plan_slug = 'enterprise' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'dueño A NO puede autoasignarse plan enterprise');
SELECT public.t_expect_denied($$update public.wa_businesses set trial_expires_at = now() + interval '3650 days' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'dueño A NO puede extender su trial');
SELECT public.t_expect_denied($$update public.wa_businesses set plan_expires_at = now() + interval '3650 days' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'dueño A NO puede extender plan_expires_at');
SELECT public.t_expect_denied($$update public.wa_businesses set is_active = false where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'dueño A NO puede cambiar is_active');
SELECT public.t_expect_denied($$update public.wa_businesses set scheduled_plan_slug = 'enterprise' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'dueño A NO puede cambiar scheduled_plan_slug');
SELECT public.t_expect_denied($$update public.wa_businesses set user_id = '22222222-2222-4222-8222-222222222222' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'dueño A NO puede transferir su negocio a B');
SELECT public.t_expect_denied($$insert into public.wa_businesses (user_id, name, slug, plan_slug, is_active, scheduled_plan_slug, trial_expires_at, plan_expires_at) values ('11111111-1111-4111-8111-111111111111', 'X', 'x-enterprise', 'enterprise', true, 'starter', now() + interval '14 days', now() + interval '14 days')$$, 'dueño A NO puede crear negocio con plan enterprise');
SELECT public.t_expect_denied($$insert into public.wa_businesses (user_id, name, slug, plan_slug, is_active, scheduled_plan_slug, trial_expires_at, plan_expires_at) values ('22222222-2222-4222-8222-222222222222', 'X', 'x-ajeno', 'pro', true, 'starter', now() + interval '14 days', now() + interval '14 days')$$, 'dueño A NO puede crear negocio a nombre de B');
SELECT public.t_expect_count('select id from public.wa_payments', 2, 'dueño A ve solo sus 2 pagos');
SELECT public.t_expect_denied($$update public.wa_payments set amount = 0$$, 'dueño A NO puede modificar pagos');
SELECT public.t_expect_denied($$insert into public.wa_payments (business_id, user_id, amount) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 1)$$, 'dueño A NO puede insertar pagos');
RESET ROLE;

-- ── ADMIN ────────────────────────────────────────────────────────────────────
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","app_metadata":{"role":"admin"}}', false);
SELECT public.t_expect_count('select * from public.wa_admin_list_business_billing()', 2, 'admin lista facturación de todos los negocios por RPC');
SELECT public.t_expect_count($$select * from public.wa_get_business_billing('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$$, 1, 'admin obtiene facturación de B por RPC');
SELECT public.t_expect_denied('select email from public.wa_businesses', 'admin usa RPC, no lectura directa de email');
SELECT public.t_expect_allowed($$update public.wa_businesses set plan_slug = 'pro' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$, 'admin puede cambiar plan (flujo de soporte)');
RESET ROLE;

-- ── SERVICE ROLE (backend: webhooks, edge functions, pagos) ─────────────────
SET ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
SELECT public.t_expect_allowed($$update public.wa_businesses set plan_slug = 'pro', trial_expires_at = now() + interval '30 days' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'service_role actualiza plan (webhook de pago)');
SELECT public.t_expect_count('select email from public.wa_businesses', 2, 'service_role lee email (backend)');
RESET ROLE;

-- ── Verificación de estructura (como postgres) ───────────────────────────────
SELECT public.t_expect_count($$select 1 from pg_policies where schemaname = 'public' and tablename = 'wa_businesses' and policyname = 'wa_businesses_public_read'$$, 0, 'política pública abierta eliminada');

-- Conexión directa de postgres: sin claims (como en Supabase), la guardia no aplica.
SELECT set_config('request.jwt.claims', '{}', false);
-- Downgrade legítimo: el dueño baja a starter un plan ya vencido (AuthContext).
-- El vencimiento lo fija postgres (el dueño no puede tocarlo).
UPDATE public.wa_businesses SET plan_expires_at = now() - interval '1 day', trial_expires_at = now() - interval '1 day'
  WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', false);
SELECT public.t_expect_allowed($$update public.wa_businesses set plan_slug = 'starter', plan_expires_at = null, trial_expires_at = null where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'dueño A puede bajar a starter un plan vencido');
RESET ROLE;
-- Restablecer un vencimiento vigente para las pruebas siguientes (postgres, sin claims).
SELECT set_config('request.jwt.claims', '{}', false);
UPDATE public.wa_businesses SET plan_slug = 'starter', plan_expires_at = null, trial_expires_at = now() - interval '1 day'
  WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', false);
SELECT public.t_expect_denied($$update public.wa_businesses set plan_slug = 'starter', plan_expires_at = now() + interval '30 days', trial_expires_at = null where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'dueño A NO puede bajar y a la vez extender el plan');
SELECT public.t_expect_denied($$update public.wa_businesses set plan_slug = 'pro' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'dueño A NO puede subir de starter/vencido a pro');
RESET ROLE;

-- Alta legítima del dueño con el trial estándar (último, porque crea una fila).
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', false);
SELECT public.t_expect_allowed($$insert into public.wa_businesses (user_id, name, slug, plan_slug, is_active, scheduled_plan_slug, trial_expires_at, plan_expires_at, plan_started_at, scheduled_change_at) values ('11111111-1111-4111-8111-111111111111', 'Nuevo', 'negocio-a-nuevo', 'pro', true, 'starter', now() + interval '14 days', now() + interval '14 days', now(), now() + interval '14 days')$$, 'dueño A puede crear negocio con trial estándar (14 días, pro)');
RESET ROLE;

SELECT 'ALL ACCESS CHECKS PASSED' AS result;
