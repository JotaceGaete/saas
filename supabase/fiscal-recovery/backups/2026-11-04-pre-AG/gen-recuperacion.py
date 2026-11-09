# Genera 02-recuperacion-A-G.sql desde las migraciones propuestas y el respaldo. Uso: python3 -I gen-recuperacion.py > 02-recuperacion-A-G.sql
import re, sys
import os
HERE = os.path.dirname(os.path.abspath(__file__))
P = os.path.join(HERE, '..', '..', 'proposed') + os.sep
BK = os.path.join(HERE, '01-respaldo-estructura-pre-AG.sql')
F = {'A': '20261031_fiscal_single_ledger_guard', 'B': '20261101_fiscal_connection', 'C': '20261102_fiscal_provider_claim_guard',
     'D': '20261031_issuer_sucursal_config', 'E': '20261102_fiscal_sii_status', 'F': '20261104_fiscal_onboarding_review',
     'G': '20261104_fiscal_product_tax_category'}
src = {k: open(P + v + '.sql').read() for k, v in F.items()}
bk = open(BK).read()

def block(text, name):
    """Último bloque 'create or replace function <name>(' ... cierre de dólar + ';' del texto."""
    pat = re.compile(r'(create or replace function\s+' + re.escape(name) + r'\s*\(.*?\bas\s+(\$[a-z_]*\$).*?\2\s*;)', re.S | re.I)
    ms = list(pat.finditer(text))
    if not ms: raise SystemExit(f'no encontrado: {name}')
    return ms[-1].group(1)

def grants(text, name):
    """revoke/grant de esa función en el archivo (para restaurar permisos idénticos)."""
    stmts = re.findall(r'\b((?:revoke|grant)\s[^;]*?\bon function\s+' + re.escape(name) + r'\s*\([^;]*;)', text, re.I | re.S)
    return '\n'.join(' '.join(x.split()) for x in stmts)

def restore(fromkey, name):
    return f'-- {name}: versión de la migración {fromkey}\n' + block(src[fromkey], name) + '\n' + grants(src[fromkey], name) + '\n'

def restore_backup(name, acl_sql):
    return f'-- {name}: versión de producción previa a A (respaldo)\n' + block(bk, name) + '\n' + acl_sql + '\n'

HDR = """-- PROCEDIMIENTO DE RECUPERACIÓN DE LAS MIGRACIONES FISCALES A–G. NO EJECUTAR SIN AUTORIZACIÓN.
-- Generado el 2026-11-04 a partir de los archivos de supabase/fiscal-recovery/proposed y del respaldo
-- 01-respaldo-estructura-pre-AG.sql (solo estructura). Probado en la base local walinka_test.
--
-- Uso: se revierte en orden inverso (G, F, E, D, C, B, A) y SOLO hasta la migración que falló o que se
-- quiere deshacer. Cada sección es una transacción y deja la base como estaba antes de esa migración.
-- Antes de cada sección: comprobar que la emisión está apagada y que no hay filas 'sending':
--   select enabled from fiscal.dte39_emission_control;                         -- debe ser false
--   select count(*) from public.crm_fiscal_issuances where status = 'sending';   -- debe ser 0
-- Pensado para usarse inmediatamente después de aplicar, ANTES de guardar credenciales o emitir:
-- quitar columnas o tablas borra lo que se haya escrito en ellas.
"""

out = [HDR]

# ---------------- G ----------------
out.append("""
-- ================================ Revertir G (tratamiento tributario) ================================
-- Borra la columna wa_products.tax_treatment (productos con IVA ya marcado lo pierden) y la categoría por
-- defecto del emisor. Vuelve a las versiones de F de emission_context y connection_status, y a la de A
-- de sale_tax_lines_verified.
begin;
set local lock_timeout = '5s';
drop trigger if exists wa_products_tax_treatment_audit on public.wa_products;
drop function if exists fiscal.audit_product_tax_treatment();
drop function if exists public.crm_fiscal_set_tax_default(uuid, uuid, text);
""")
out.append(restore('F', 'public.crm_fiscal_emission_context'))
out.append(restore('F', 'public.crm_fiscal_connection_status'))
out.append(restore('A', 'fiscal.sale_tax_lines_verified'))
out.append("""drop function if exists fiscal.line_tax_category(uuid, uuid, uuid);
alter table public.wa_products drop constraint if exists wa_products_tax_treatment_check;
alter table public.wa_products drop column if exists tax_treatment;
alter table fiscal.issuers drop constraint if exists issuers_default_tax_category_check;
alter table fiscal.issuers drop column if exists default_tax_category;
alter table fiscal.admin_audit drop constraint if exists admin_audit_action_check;
alter table fiscal.admin_audit add constraint admin_audit_action_check
  check (action in ('reconcile_attempt', 'reconcile_result', 'owner_changed', 'credentials_saved',
                    'credentials_removed', 'application_submitted', 'application_approved',
                    'application_rejected', 'application_suspended'));
commit;
""")

# ---------------- F ----------------
out.append("""
-- ================================ Revertir F (alta y revisión) ================================
-- Exige que no haya filas de auditoría con acciones de F (admin_audit es solo-anexar: no se borran).
begin;
set local lock_timeout = '5s';
do $$ begin
  if exists (select 1 from fiscal.admin_audit where action like 'application_%') then
    raise exception 'Hay auditoría de solicitudes: no se revierte F sin decidir qué hacer con ella';
  end if;
end $$;
drop trigger if exists business_credentials_reset_review on fiscal.business_credentials;
drop function if exists fiscal.credentials_reset_review();
drop function if exists public.crm_fiscal_submit_application(uuid, uuid, integer, date, text, text);
drop function if exists public.crm_fiscal_review_application(uuid, uuid, text, text);
drop function if exists public.crm_fiscal_list_applications(text);
""")
out.append(restore('D', 'public.crm_fiscal_emission_context'))
out.append(restore('B', 'public.crm_fiscal_connection_status'))
out.append("""alter table fiscal.issuers drop constraint if exists issuers_review_check;
alter table fiscal.issuers
  drop column if exists review_status, drop column if exists review_note, drop column if exists submitted_at,
  drop column if exists submitted_by, drop column if exists reviewed_at, drop column if exists reviewed_by,
  drop column if exists resolucion_numero, drop column if exists resolucion_fecha;
alter table fiscal.admin_audit drop constraint if exists admin_audit_action_check;
alter table fiscal.admin_audit add constraint admin_audit_action_check
  check (action in ('reconcile_attempt', 'reconcile_result', 'owner_changed', 'credentials_saved', 'credentials_removed'));
commit;
""")

# ---------------- E ----------------
out.append("""
-- ================================ Revertir E (estado SII) ================================
begin;
set local lock_timeout = '5s';
do $$ begin
  if exists (select 1 from fiscal.crm_fiscal_sii_status_events) then
    raise exception 'Hay eventos de estado SII registrados: no se revierte E sin respaldarlos';
  end if;
end $$;
drop trigger if exists crm_fiscal_issuances_guard_issued on public.crm_fiscal_issuances;
drop trigger if exists crm_fiscal_issuances_same_day on public.crm_fiscal_issuances;
drop function if exists fiscal.guard_issued_document();
drop function if exists fiscal.guard_same_day_claim();
drop function if exists public.crm_fiscal_record_sii_status(uuid, uuid, text, text, text, text, uuid);
drop function if exists public.crm_finalize_fiscal_issuance(uuid, uuid, text, text, integer, text, text, text);
""")
out.append(restore('C', 'public.crm_finalize_fiscal_issuance'))
out.append(restore('A', 'public.crm_fiscal_get_issuance'))
out.append("""drop table if exists fiscal.crm_fiscal_sii_status_events;
drop function if exists fiscal.sii_events_append_only();
alter table public.crm_fiscal_issuances drop constraint if exists crm_fiscal_issuances_sii_status_check;
alter table public.crm_fiscal_issuances
  drop column if exists sii_status, drop column if exists sii_track_id, drop column if exists sii_status_detail,
  drop column if exists sii_status_source, drop column if exists sii_checked_at, drop column if exists issued_at;
commit;
""")

# ---------------- D ----------------
out.append("""
-- ================================ Revertir D (sucursal) ================================
begin;
set local lock_timeout = '5s';
""")
out.append(restore('A', 'public.crm_fiscal_emission_context'))
out.append("""alter table fiscal.issuers drop constraint if exists issuers_sucursal_pair_check;
alter table fiscal.issuers drop column if exists sucursal_nombre, drop column if exists sucursal_codigo;
commit;
""")

# ---------------- C ----------------
out.append("""
-- ================================ Revertir C (reclamo con credenciales) ================================
-- Exige que no haya filas del ledger con proveedor 'dtecore' (la restricción vuelve a solo 'siisolutions').
begin;
set local lock_timeout = '5s';
do $$ begin
  if exists (select 1 from public.crm_fiscal_issuances where provider <> 'siisolutions') then
    raise exception 'Hay filas con proveedor distinto de siisolutions: no se revierte C';
  end if;
end $$;
drop function if exists public.crm_fiscal_claim_with_credentials(uuid, uuid, text);
drop function if exists public.crm_fiscal_release_claim(uuid, uuid, text);
""")
for n in ['public.crm_fiscal_finalize_from_receipt', 'public.crm_fiscal_list_stale_sending', 'public.crm_fiscal_mark_failed',
          'public.crm_fiscal_mark_stale_unknown', 'public.crm_fiscal_reconcile_with_evidence', 'public.crm_fiscal_store_receipt']:
    out.append(restore('A', n))
out.append(restore_backup('public.crm_finalize_fiscal_issuance',
    'revoke all on function public.crm_finalize_fiscal_issuance(uuid, uuid, text, text, integer, text, text) from public, anon, authenticated;\n'
    'grant execute on function public.crm_finalize_fiscal_issuance(uuid, uuid, text, text, integer, text, text) to service_role;'))
out.append(restore_backup('public.crm_reconcile_fiscal_issuance',
    'revoke all on function public.crm_reconcile_fiscal_issuance(uuid, uuid, text, integer, text, text) from public, anon, authenticated;\n'
    'grant execute on function public.crm_reconcile_fiscal_issuance(uuid, uuid, text, integer, text, text) to service_role;'))
out.append("""drop function if exists fiscal.ledger_provider(text);
alter table public.crm_fiscal_issuances drop constraint if exists crm_fiscal_issuances_provider_check;
alter table public.crm_fiscal_issuances add constraint crm_fiscal_issuances_provider_check check (provider = 'siisolutions');
commit;
""")

# ---------------- B ----------------
out.append("""
-- ================================ Revertir B (conexión de credenciales) ================================
begin;
set local lock_timeout = '5s';
do $$ begin
  if exists (select 1 from fiscal.issuers where provider <> 'sii_solutions') then
    raise exception 'Hay emisores con proveedor dtecore: no se revierte B';
  end if;
end $$;
drop function if exists public.crm_fiscal_save_credentials(uuid, uuid, text, bytea, bytea, bytea, integer);
drop function if exists public.crm_fiscal_disconnect(uuid, uuid);
drop function if exists public.crm_fiscal_connection_status(uuid);
drop function if exists fiscal.has_fresh_sending(uuid);
drop function if exists fiscal.sending_stale_window();
alter table fiscal.issuers drop constraint if exists issuers_provider_check;
alter table fiscal.issuers add constraint issuers_provider_check check (provider = 'sii_solutions');
commit;
""")

# ---------------- A ----------------
out.append("""
-- ================================ Revertir A (ledger único y guardas) ================================
-- Vuelve permisos de crm_invoices y wa_businesses a los del respaldo, quita triggers nuevos (incluidos los
-- de wa_businesses y de las colas antiguas), borra tablas y funciones nuevas y restaura las 2 funciones
-- previas. Exige que las tablas nuevas estén vacías (credenciales, recibos, evidencias, bloqueos).
begin;
set local lock_timeout = '5s';
do $$ begin
  if exists (select 1 from fiscal.business_credentials) or exists (select 1 from fiscal.crm_fiscal_provider_receipts)
     or exists (select 1 from fiscal.crm_fiscal_reconciliation_evidence)
     -- los 4 bloqueos que la propia A carga (ventas Point antiguas) no cuentan
     or exists (select 1 from fiscal.retroactive_emission_blocks where sale_id not in (
          '8d40285b-4d52-41fa-ab7a-90870ca150dd', 'df077a1b-7cdc-4825-8750-6a5a991a3095',
          'ef2746fd-ca30-4ebc-86c6-4b8442e5fb84', '661c88a9-9731-46f8-a685-4e112290a98e')) then
    raise exception 'Hay datos en tablas de A: respaldarlos antes de revertir';
  end if;
end $$;
-- Triggers nuevos
drop trigger if exists fiscal_p3_cross_pipeline_guard on fiscal.pos_dte39_outbox;
drop trigger if exists fiscal_p1_cross_pipeline_guard on fiscal.operations;
drop trigger if exists fiscal_p4_cross_pipeline_guard on public.crm_point_fiscal_outbox;
drop trigger if exists wa_businesses_seed_fiscal_owner on public.wa_businesses;
drop trigger if exists wa_businesses_owner_change on public.wa_businesses;
-- Roles sembrados por A (P0 dejó la tabla vacía; no hay otra fuente de filas sin granted_by)
delete from fiscal.business_fiscal_roles where role = 'fiscal_owner' and granted_by is null;
-- Permisos de tabla del respaldo
grant all on table public.crm_invoices to anon;
do $$
declare c record;
begin
  for c in select column_name from information_schema.columns where table_schema = 'public' and table_name = 'wa_businesses' loop
    execute format('revoke update (%I) on public.wa_businesses from anon, authenticated', c.column_name);
  end loop;
end $$;
grant update on table public.wa_businesses to anon, authenticated;
grant execute on function fiscal.dte39_evidence_append_only() to public;
-- Lecturas que A concede a service_role (antes de A no tenía ningún permiso sobre estas tablas)
revoke select on fiscal.dte39_emission_control from service_role;
revoke select on fiscal.pos_dte39_outbox from service_role;
-- Tablas nuevas (vacías, comprobado arriba)
drop table if exists fiscal.crm_fiscal_provider_receipts;
drop table if exists fiscal.crm_fiscal_reconciliation_evidence;
drop table if exists fiscal.retroactive_emission_blocks;
drop table if exists fiscal.business_credentials;
-- Funciones nuevas
drop function if exists public.crm_fiscal_reconcile_admin(uuid, uuid, text, uuid, uuid, text, integer, text, text, text, text, text, text, timestamptz);
drop function if exists public.crm_fiscal_reconcile_with_evidence(uuid, uuid, text, text, integer, text, text, text, text, text, text, timestamptz);
drop function if exists public.crm_fiscal_store_receipt(uuid, uuid, text, integer, text, text);
drop function if exists public.crm_fiscal_mark_stale_unknown(uuid, uuid, text, timestamptz);
drop function if exists public.crm_fiscal_mark_failed(uuid, uuid, text, text);
drop function if exists public.crm_fiscal_list_stale_sending(timestamptz);
drop function if exists public.crm_fiscal_has_role(uuid, uuid, text);
drop function if exists public.crm_fiscal_get_issuance(uuid, uuid);
drop function if exists public.crm_fiscal_get_credentials(uuid);
drop function if exists public.crm_fiscal_finalize_from_receipt(uuid, uuid, text);
drop function if exists public.crm_fiscal_emission_context(uuid, uuid);
drop function if exists public.crm_fiscal_audit_append(uuid, uuid, uuid, text, text, jsonb);
drop function if exists public.crm_fiscal_actor_role(uuid, uuid);
drop function if exists fiscal.seed_owner_role();
drop function if exists fiscal.handle_owner_change();
drop function if exists fiscal.sale_tax_lines_verified(uuid, uuid);
drop function if exists fiscal.sale_payment_medio(uuid, uuid);
drop function if exists fiscal.sale_fiscal_conflict(uuid, uuid);
drop function if exists fiscal.guard_cross_pipeline_write();
drop function if exists fiscal.has_role(uuid, uuid, text);
drop function if exists fiscal.actor_role(uuid, uuid);
""")
out.append(restore_backup('public.crm_claim_fiscal_issuance',
    'revoke all on function public.crm_claim_fiscal_issuance(uuid, uuid, text, integer) from public, anon, authenticated;\n'
    'grant execute on function public.crm_claim_fiscal_issuance(uuid, uuid, text, integer) to service_role;'))
out.append("commit;\n")
sys.stdout.write('\n'.join(out))
