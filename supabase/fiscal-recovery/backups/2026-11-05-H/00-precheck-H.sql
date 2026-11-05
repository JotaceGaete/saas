-- PRECHEQUEO DE LA MIGRACIÓN H. SOLO LECTURA (SELECT). Devuelve conteos, nunca RUT ni datos de clientes.
-- Ejecutar antes de aplicar H. Si alguna fila sale con bloquea = true, H abortaría sin cambios: decidir
-- caso a caso antes (corregir el RUT o crear un grupo de RUT compartido).
with r as (
  select business_id, upper(regexp_replace(issuer_rut, '[.[:space:]]', '', 'g')) v from fiscal.issuers
), p as (
  select business_id, v, ltrim(split_part(v, '-', 1), '0') body, split_part(v, '-', 2) dv
    from r where v ~ '^[0-9]{1,8}-[0-9K]$'
), s as (
  select business_id, body, dv,
         (select sum(substr(reverse(body), i, 1)::int * (2 + (i - 1) % 6)) from generate_series(1, length(body)) i) sm
    from p where body <> ''
), canon as (
  select business_id, body || '-' || dv rut,
         dv = (case 11 - sm % 11 when 11 then '0' when 10 then 'K' else (11 - sm % 11)::text end) ok
    from s
)
select 'emisores' chequeo, (select count(*) from fiscal.issuers)::text valor, false bloquea
union all
select 'emisores con RUT inválido (formato o dígito verificador)',
       ((select count(*) from fiscal.issuers) - (select count(*) from canon where ok))::text,
       (select count(*) from fiscal.issuers) <> (select count(*) from canon where ok)
union all
select 'RUT repetidos entre comercios (tras normalizar)',
       (select count(*) from (select rut from canon where ok group by rut having count(*) > 1) d)::text,
       exists (select 1 from canon where ok group by rut having count(*) > 1)
union all
select 'documentos sending/unknown/issued/cancelled sin emisor ni <RUTEmisor> en el XML',
       (select count(*) from public.crm_fiscal_issuances f
         where f.status in ('sending', 'unknown', 'issued', 'cancelled')
           and not exists (select 1 from fiscal.issuers s where s.business_id = f.business_id)
           and coalesce(position('<RUTEmisor>' in convert_from(decode(coalesce(f.xml_base64, ''), 'base64'), 'LATIN1')), 0) = 0)::text,
       exists (select 1 from public.crm_fiscal_issuances f
         where f.status in ('sending', 'unknown', 'issued', 'cancelled')
           and not exists (select 1 from fiscal.issuers s where s.business_id = f.business_id)
           and coalesce(position('<RUTEmisor>' in convert_from(decode(coalesce(f.xml_base64, ''), 'base64'), 'LATIN1')), 0) = 0)
union all
select 'documentos emitidos (issued/cancelled) con folio', (select count(*) from public.crm_fiscal_issuances where status in ('issued', 'cancelled') and folio is not null)::text, false
union all
select 'folios repetidos del mismo comercio en el ledger (issued/cancelled)',
       (select count(*) from (select business_id, dte_type, folio from public.crm_fiscal_issuances
                               where status in ('issued', 'cancelled') and folio is not null group by 1, 2, 3 having count(*) > 1) d)::text,
       exists (select 1 from public.crm_fiscal_issuances where status in ('issued', 'cancelled') and folio is not null
                group by business_id, dte_type, folio having count(*) > 1)
union all
select 'operaciones P1 con folio', (select count(*) from fiscal.operations where folio is not null)::text, false
union all
select 'filas en sending', (select count(*) from public.crm_fiscal_issuances where status = 'sending')::text, false
union all
select 'emisión global encendida', (select coalesce(bool_or(enabled), false) from fiscal.dte39_emission_control)::text, false;
