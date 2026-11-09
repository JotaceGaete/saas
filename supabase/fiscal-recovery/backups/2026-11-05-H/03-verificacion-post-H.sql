-- VERIFICACIÓN POSTERIOR A LA MIGRACIÓN H. SOLO LECTURA. Cada fila debe salir con ok = true.
select chequeo, ok from (values
  ('normalize_rut válido', fiscal.normalize_rut('76.123.456-0') = '76123456-0' and fiscal.normalize_rut('76123456-7') is null),
  ('emisores con RUT canónico', not exists (select 1 from fiscal.issuers where issuer_rut is distinct from fiscal.normalize_rut(issuer_rut))),
  ('índice único de RUT sin grupo', exists (select 1 from pg_indexes where schemaname = 'fiscal' and indexname = 'issuers_rut_unshared_uq')),
  ('trigger de RUT activo', exists (select 1 from pg_trigger where tgname = 'issuers_guard_rut' and tgenabled = 'O')),
  ('trigger de identidad activo', exists (select 1 from pg_trigger where tgname = 'crm_fiscal_issuances_identity' and tgenabled = 'O')),
  ('trigger de folios activo', exists (select 1 from pg_trigger where tgname = 'crm_fiscal_issuances_register_folio' and tgenabled = 'O')),
  ('bloqueo de ventas: invoices', exists (select 1 from pg_trigger where tgname = 'crm_invoices_fiscal_lock' and tgenabled = 'O')),
  ('bloqueo de ventas: items', exists (select 1 from pg_trigger where tgname = 'crm_invoice_items_fiscal_lock' and tgenabled = 'O')),
  ('bloqueo de ventas: pagos', exists (select 1 from pg_trigger where tgname = 'crm_payments_fiscal_lock' and tgenabled = 'O')),
  ('bloqueo de NC activo', exists (select 1 from pg_trigger where tgname = 'credit_notes_guard' and tgenabled = 'O')),
  ('documentos sin RUT emisor = 0', not exists (select 1 from public.crm_fiscal_issuances where issuer_rut is null and status in ('sending', 'unknown', 'issued', 'cancelled'))),
  ('cada emitido con folio está registrado', not exists (
     select 1 from public.crm_fiscal_issuances f where f.status in ('issued', 'cancelled') and f.folio is not null
        and not exists (select 1 from fiscal.document_folios d where d.source_table = 'crm_fiscal_issuances' and d.source_id = f.id))),
  ('confirmaciones de RUT: tabla solo-anexar', exists (select 1 from pg_trigger where tgname = 'rut_confirmations_append_only' and tgenabled = 'O')),
  ('emisión global sigue apagada', not exists (select 1 from fiscal.dte39_emission_control where enabled)),
  ('service_role solo lee las tablas nuevas',
     has_table_privilege('service_role', 'fiscal.rut_confirmations', 'SELECT')
     and not has_table_privilege('service_role', 'fiscal.rut_confirmations', 'INSERT')
     and not has_table_privilege('service_role', 'fiscal.document_folios', 'INSERT')
     and not has_table_privilege('service_role', 'fiscal.credit_notes', 'UPDATE')
     and not has_table_privilege('service_role', 'fiscal.tributary_corrections', 'INSERT')
     and not has_table_privilege('service_role', 'fiscal.rut_share_groups', 'INSERT')),
  ('authenticated sin acceso a tablas nuevas',
     not has_table_privilege('authenticated', 'fiscal.rut_confirmations', 'SELECT')
     and not has_table_privilege('authenticated', 'fiscal.credit_notes', 'SELECT')),
  ('RPC nuevas solo para service_role',
     has_function_privilege('service_role', 'public.crm_fiscal_confirm_issuer_rut(uuid, uuid, text)', 'EXECUTE')
     and not has_function_privilege('authenticated', 'public.crm_fiscal_confirm_issuer_rut(uuid, uuid, text)', 'EXECUTE')
     and not has_function_privilege('anon', 'public.crm_fiscal_authorize_tributary_correction(uuid, uuid, uuid, text, text)', 'EXECUTE')
     and not has_function_privilege('authenticated', 'public.crm_fiscal_create_rut_share(uuid, text, uuid[], text, text)', 'EXECUTE')
     and not has_function_privilege('authenticated', 'public.crm_fiscal_draft_credit_note(uuid, uuid, uuid, integer, text, numeric, jsonb)', 'EXECUTE')),
  ('evidencia solo-anexar', exists (select 1 from pg_trigger where tgname = 'rut_confirmations_append_only')
     and exists (select 1 from pg_trigger where tgname = 'document_folios_append_only')
     and exists (select 1 from pg_trigger where tgname = 'tributary_corrections_append_only'))
) t(chequeo, ok);
