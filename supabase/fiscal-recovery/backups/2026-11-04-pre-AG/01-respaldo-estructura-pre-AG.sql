-- RESPALDO DE ESTRUCTURA PREVIO A LAS MIGRACIONES FISCALES A–G
-- Proyecto: Walinka (Supabase, producción). Capturado: 2026-11-04, solo lectura (SELECT al catálogo).
-- Contenido: definiciones de funciones, permisos (ACL), restricciones, triggers y políticas de los
-- objetos que A–G reemplazan o alteran. SIN datos de clientes, credenciales ni secretos.
-- Este archivo NO se ejecuta completo: se usa por partes desde 02-recuperacion-A-G.sql.
--
-- Estado de migraciones al capturar:
--   total 234; última 20261102223104 (fiscal_pre_a_permissions_policies_snapshot)
--   P0 aplicada: 20261102222438 fiscal_p0_admin_tables (md5 de statements = md5 del archivo del repo:
--     2cfd3cdf135a7eba09686fed06d7078e, 2710 caracteres → idénticos)
--   A, B, C, D, E, F, G: NO aplicadas (no existen business_credentials, receipts, evidence,
--     retroactive_emission_blocks, sii_status_events, tax_treatment, review_status...)
--   Respaldo parcial previo en producción: tabla fiscal.fiscal_pre_a_backup (2026-11-02).
--
-- Funciones que A–G crean o reemplazan: 44. Existen hoy solo 4 (abajo). Las otras 40 son nuevas.

-- ===========================================================================================
-- 1. Funciones existentes (definición exacta de pg_get_functiondef) y su ACL
-- ===========================================================================================

-- public.crm_claim_fiscal_issuance(uuid,uuid,text,integer)   — la reemplaza A
-- ACL: {postgres=X/postgres,service_role=X/postgres}   md5 def: 06d1f18683242ffa3e6b1d60e8452afb
CREATE OR REPLACE FUNCTION public.crm_claim_fiscal_issuance(p_business_id uuid, p_sale_id uuid, p_operation_id text, p_dte_type integer DEFAULT 39)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_id uuid;
begin
  if p_dte_type is distinct from 39 or nullif(trim(p_operation_id), '') is null or
     not exists (select 1 from public.crm_invoices i where i.id = p_sale_id and i.business_id = p_business_id) then
    raise exception 'Invalid fiscal issuance claim';
  end if;
  insert into public.crm_fiscal_issuances (business_id, sale_id, operation_id, dte_type, status)
  values (p_business_id, p_sale_id, p_operation_id, p_dte_type, 'sending')
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    update public.crm_fiscal_issuances
    set status = 'sending', updated_at = now()
    where business_id = p_business_id and sale_id = p_sale_id and dte_type = p_dte_type
      and operation_id = p_operation_id and status = 'pending'
    returning id into v_id;
  end if;
  return v_id is not null;
end;
$function$;

-- public.crm_finalize_fiscal_issuance(uuid,uuid,text,text,integer,text,text)   — la reemplaza C; E la BORRA
--   y crea otra con 8 argumentos.
-- ACL: {postgres=X/postgres,service_role=X/postgres}   md5 def: 019d988004dbc0e4e6ef18332f60c866
CREATE OR REPLACE FUNCTION public.crm_finalize_fiscal_issuance(p_business_id uuid, p_sale_id uuid, p_operation_id text, p_status text, p_folio integer DEFAULT NULL::integer, p_xml_base64 text DEFAULT NULL::text, p_pdf_base64 text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_count integer;
begin
  if p_status is null or p_status not in ('issued', 'unknown') then
    raise exception 'Invalid fiscal outcome';
  end if;
  if p_folio is not null and p_folio <= 0 then
    raise exception 'Invalid fiscal folio';
  end if;
  if p_status = 'issued' and (p_folio is null or
       nullif(p_xml_base64, '') is null or nullif(p_pdf_base64, '') is null) then
    raise exception 'Issued outcome requires folio, XML and PDF';
  end if;
  update public.crm_fiscal_issuances
  set status = p_status,
      folio = p_folio,
      xml_base64 = case when p_status = 'issued' then p_xml_base64 else null end,
      pdf_base64 = case when p_status = 'issued' then p_pdf_base64 else null end,
      updated_at = now()
  where business_id = p_business_id and sale_id = p_sale_id
    and operation_id = p_operation_id and status = 'sending'
    and provider = 'siisolutions' and dte_type = 39;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$function$;

-- public.crm_reconcile_fiscal_issuance(uuid,uuid,text,integer,text,text)   — la reemplaza C
-- ACL: {postgres=X/postgres,service_role=X/postgres}   md5 def: 4a903525204952f3c0ca7e63b65f2d06
CREATE OR REPLACE FUNCTION public.crm_reconcile_fiscal_issuance(p_business_id uuid, p_sale_id uuid, p_operation_id text, p_folio integer, p_xml_base64 text, p_pdf_base64 text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ declare v_count integer; begin if p_business_id is null or p_sale_id is null or nullif(trim(p_operation_id),'') is null or p_folio is null or p_folio<=0 or nullif(trim(p_xml_base64),'') is null or nullif(trim(p_pdf_base64),'') is null then raise exception 'Invalid original fiscal document'; end if; update public.crm_fiscal_issuances set status='issued',folio=p_folio,xml_base64=p_xml_base64,pdf_base64=p_pdf_base64,error_code=null,updated_at=now() where business_id=p_business_id and sale_id=p_sale_id and operation_id=p_operation_id and dte_type=39 and provider='siisolutions' and status='unknown' and (folio is null or folio=p_folio); get diagnostics v_count=row_count; return v_count=1; end; $function$;

-- fiscal.dte39_evidence_append_only()   — A le quita EXECUTE a public/anon/authenticated
-- ACL: DEFAULT (PUBLIC puede ejecutar)   md5 def: 5d7d17b6584c21b734a3faee5ba353a3
CREATE OR REPLACE FUNCTION fiscal.dte39_evidence_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'fiscal'
AS $function$
begin raise exception 'FISCAL_EVIDENCE_IMMUTABLE'; end; $function$;

-- ===========================================================================================
-- 2. Permisos de tabla (relacl) al capturar
-- ===========================================================================================
-- public.crm_invoices    {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
--                        RLS activo; única política: crm_invoices_owner (ALL, authenticated, dueño del negocio).
--                        anon no tiene política: hoy ya no lee ni escribe filas. A revoca ALL a anon.
-- public.wa_businesses   {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
--                        sin permisos por columna. 44 columnas. A cambia UPDATE de tabla por UPDATE por columna (sin user_id).
--                        Políticas: wa_businesses_admin_select (SELECT authenticated wa_is_admin()),
--                        wa_businesses_owner_all (ALL authenticated user_id = auth.uid()),
--                        wa_businesses_owner_insert (INSERT authenticated), wa_businesses_public_read (SELECT public true).
--                        Triggers: trigger_queue_new_user_alert, trigger_queue_onboarding_tips (AFTER INSERT),
--                        wa_businesses_fill_email_from_auth (BEFORE INSERT/UPDATE), wa_businesses_updated_at.
-- public.wa_products     {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
--                        Políticas: wa_products_admin_select, wa_products_owner_all, wa_products_public_read (is_active = true).
--                        G agrega la columna tax_treatment (nullable) y un trigger AFTER UPDATE OF tax_treatment.
-- public.crm_fiscal_issuances {postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}  RLS activo, sin políticas.
-- fiscal.issuers         {postgres=arwdDxtm/postgres,service_role=arw/postgres}  RLS activo.
-- fiscal.admin_audit     {postgres=arwdDxtm/postgres,service_role=arwd/postgres}
-- fiscal.business_fiscal_roles {postgres=arwdDxtm/postgres,service_role=arwd/postgres}
-- fiscal.pos_dte39_outbox, fiscal.operations, public.crm_point_fiscal_outbox, fiscal.dte39_emission_control: solo postgres/service_role.

-- ===========================================================================================
-- 3. Restricciones que B, C, F y G reemplazan (definición actual)
-- ===========================================================================================
-- fiscal.admin_audit.admin_audit_action_check:
--   CHECK ((action = ANY (ARRAY['reconcile_attempt','reconcile_result','owner_changed','credentials_saved','credentials_removed'])))
-- fiscal.issuers.issuers_provider_check:            CHECK ((provider = 'sii_solutions'::text))
-- fiscal.issuers.issuers_issuer_rut_check:          CHECK ((issuer_rut ~ '^[0-9]{1,8}-[0-9K]$'::text))   (no cambia)
-- public.crm_fiscal_issuances.crm_fiscal_issuances_provider_check:  CHECK ((provider = 'siisolutions'::text))
-- public.crm_fiscal_issuances.crm_fiscal_issuances_status_check:
--   CHECK ((status = ANY (ARRAY['pending','sending','unknown','issued','failed','cancelled'])))   (no cambia)
-- fiscal.business_fiscal_roles.business_fiscal_roles_role_check:
--   CHECK ((role = ANY (ARRAY['fiscal_owner','fiscal_operator','fiscal_viewer','fiscal_reconciler'])))  (A la recrea igual)
-- fiscal.issuers columnas: business_id, issuer_rut, provider, enabled, verified, created_at, updated_at
-- public.crm_fiscal_issuances columnas: id, business_id, sale_id, provider, dte_type, operation_id, status, folio,
--   xml_base64, pdf_base64, error_code, created_at, updated_at

-- ===========================================================================================
-- 4. Triggers relevantes (estado: O = activo, D = desactivado)
-- ===========================================================================================
-- public.crm_invoices        crm_invoice_paid_pos_dte39_enqueue  D  fiscal.enqueue_paid_pos_dte39()
-- public.crm_invoices        crm_invoices_updated_at             O
-- public.crm_pos_point_operations trg_enqueue_point_fiscal_pilot  D  crm_enqueue_point_fiscal_pilot()
-- public.crm_pos_point_operations crm_pos_point_operations_updated_at O
-- public.crm_payments        crm_payments_set_payment_number, crm_payments_updated_at   O
-- fiscal.admin_audit         admin_audit_append_only             O  fiscal.dte39_evidence_append_only()
-- fiscal.dte39_reconciliation_evidence dte39_evidence_append_only O
-- fiscal.pos_dte39_outbox    protect_dte39_outbox_transition     O
-- Ninguna migración A–G activa o desactiva triggers existentes.

-- ===========================================================================================
-- 5. Estado (solo conteos agregados, sin filas)
-- ===========================================================================================
-- crm_fiscal_issuances: issued 1 · pos_dte39_outbox: skipped 17 · fiscal.operations: pending 2 ·
-- crm_point_fiscal_outbox: 0 · fiscal.issuers: 1 (provider sii_solutions, enabled=false, verified=false) ·
-- business_fiscal_roles: 0 · admin_audit: 0 · line_tax_verifications: 0 · wa_businesses: 96 ·
-- ventas presentes en dos circuitos fiscales a la vez: 0 · dte39_emission_control.enabled = false
-- cron: 8 tareas activas, ninguna fiscal (point-reconcile-stale-operations cada 2 min, no toca tablas fiscales).
-- Edge Functions desplegadas: 41, ninguna fiscal (fiscal-emit no desplegada); las 11 de Point (mp-point-*) no usan tablas fiscales.
