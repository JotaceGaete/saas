-- P0 — PROPUESTA — no aplicar en producción sin autorización.
-- Crea las dos tablas que usan 20261031_fiscal_single_ledger_guard, 20261101 y 20261102 y que
-- no existen en producción ni en ninguna migración del repositorio. Definición tomada de walinka_test (\d verificado).
--
-- DELIBERADAMENTE NO INCLUYE: triggers sobre public.wa_businesses (fiscal.seed_owner_role,
-- fiscal.handle_owner_change). Son la fase 1 de F3 y cambian el alta y el cambio de dueño de cada comercio:
-- requieren autorización aparte.

create table if not exists fiscal.admin_audit (
  id            bigserial primary key,
  business_id   uuid not null,
  sale_id       uuid,
  actor_user_id uuid,
  action        text not null,
  outcome       text not null,
  detail        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  constraint admin_audit_action_check check (action = any (array[
    'reconcile_attempt','reconcile_result','owner_changed','credentials_saved','credentials_removed']::text[])),
  constraint admin_audit_outcome_check check (length(outcome) >= 1 and length(outcome) <= 80)
);

create table if not exists fiscal.business_fiscal_roles (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.wa_businesses(id) on delete restrict,
  user_id     uuid not null,
  role        text not null,
  granted_by  uuid,
  granted_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  constraint business_fiscal_roles_role_check check (role = any (array[
    'fiscal_owner','fiscal_operator','fiscal_viewer','fiscal_reconciler']::text[]))
);

create unique index if not exists business_fiscal_roles_active_idx
  on fiscal.business_fiscal_roles (business_id, user_id, role) where revoked_at is null;

-- Solo-anexar: la función de bloqueo ya existe en producción (fiscal.dte39_evidence_append_only).
drop trigger if exists admin_audit_append_only on fiscal.admin_audit;
create trigger admin_audit_append_only before delete or update on fiscal.admin_audit
  for each row execute function fiscal.dte39_evidence_append_only();

-- RLS activo sin políticas: solo service_role (BYPASSRLS) y el propietario acceden.
alter table fiscal.admin_audit enable row level security;
alter table fiscal.business_fiscal_roles enable row level security;
revoke all on fiscal.admin_audit from public, anon, authenticated;
revoke all on fiscal.business_fiscal_roles from public, anon, authenticated;
grant select, insert, update, delete on fiscal.admin_audit to service_role;
grant select, insert, update, delete on fiscal.business_fiscal_roles to service_role;
grant usage, select on sequence fiscal.admin_audit_id_seq to service_role;
