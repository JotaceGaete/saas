-- G — Tratamiento tributario de los productos. PROPUESTA: NO APLICADA EN PRODUCCIÓN.
--     Depende de P0, A, B, C, D, E y F (va después de F).
--
-- Auditoría previa (2026-11-04):
--   - Producción no tiene ningún campo de impuesto en wa_products, crm_invoice_items ni
--     crm_invoices (consulta de solo lectura a information_schema). El TPV guarda precios con
--     IVA incluido y no calcula IVA.
--   - Única clasificación existente: fiscal.line_tax_verifications (piloto, por línea y venta).
--   - Contrato DTE Core verificado SOLO con líneas afectas (XML aceptados 51105 y 51106). El
--     campo esExento existe en el cuerpo, pero no hay ninguna emisión con línea exenta probada.
--   - SII (Formato Boletas Electrónicas v4.2): IndExe = 1 marca un ítem "exento o no afecto";
--     la boleta no afecta o exenta es el tipo 41. Esta integración solo emite DTE 39.
--
-- Qué hace:
--   1. wa_products.tax_treatment (nullable): IVA_AFECTO_19 | EXENTO | NO_AFECTO. Se edita en el
--      editor de productos. NULL = usar la categoría por defecto del negocio. Las filas actuales
--      quedan en NULL: nada cambia para productos ni ventas existentes.
--   2. fiscal.issuers.default_tax_category: categoría por defecto del negocio (solo tiene efecto
--      si el comercio usa facturación electrónica). Cubre productos sin categoría y artículos
--      manuales del TPV.
--   3. Categoría efectiva de cada línea: verificación manual del piloto (con huella) > categoría
--      del producto > categoría por defecto del negocio. Sin ninguna, la línea no tiene categoría.
--   4. Una venta solo se puede emitir como DTE 39 si TODAS sus líneas son afectas. Con alguna
--      línea exenta o no afecta, o sin categoría, la base rechaza el reclamo (no se emite con
--      información tributaria incompleta ni con un caso no verificado contra DTE Core).
--      El TPV imprime el comprobante interno de siempre.
--   5. Los cambios de tratamiento tributario de un producto quedan en fiscal.admin_audit.
--
-- No cambia: numeración (invoice_number), idempotencia de la emisión, boletas ya emitidas.

begin;
-- Ajuste previo a producción (2026-11-04): no esperar indefinidamente un bloqueo de tablas en uso.
set local lock_timeout = '5s';

-- 1. Tratamiento tributario del producto -----------------------------------------------------
alter table public.wa_products add column if not exists tax_treatment text;
alter table public.wa_products drop constraint if exists wa_products_tax_treatment_check;
alter table public.wa_products add constraint wa_products_tax_treatment_check
  check (tax_treatment is null or tax_treatment in ('IVA_AFECTO_19', 'EXENTO', 'NO_AFECTO'));
comment on column public.wa_products.tax_treatment is
  'Tratamiento tributario para boletas electrónicas: IVA_AFECTO_19, EXENTO o NO_AFECTO. NULL = categoría por defecto del negocio.';

-- 2. Categoría por defecto del negocio --------------------------------------------------------
alter table fiscal.issuers add column if not exists default_tax_category text;
alter table fiscal.issuers drop constraint if exists issuers_default_tax_category_check;
alter table fiscal.issuers add constraint issuers_default_tax_category_check
  check (default_tax_category is null or default_tax_category in ('IVA_AFECTO_19', 'EXENTO', 'NO_AFECTO'));

-- 3. Auditoría --------------------------------------------------------------------------------
alter table fiscal.admin_audit drop constraint if exists admin_audit_action_check;
alter table fiscal.admin_audit add constraint admin_audit_action_check
  check (action in ('reconcile_attempt', 'reconcile_result', 'owner_changed', 'credentials_saved',
                    'credentials_removed', 'application_submitted', 'application_approved',
                    'application_rejected', 'application_suspended', 'tax_default_set', 'tax_product_set'));

create or replace function fiscal.audit_product_tax_treatment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, fiscal
as $$
begin
  if new.tax_treatment is distinct from old.tax_treatment and new.business_id is not null then
    insert into fiscal.admin_audit (business_id, sale_id, actor_user_id, action, outcome, detail)
    values (new.business_id, null, auth.uid(), 'tax_product_set', coalesce(new.tax_treatment, 'cleared'),
            jsonb_build_object('product_id', new.id, 'from', old.tax_treatment, 'to', new.tax_treatment));
  end if;
  return new;
end;
$$;
revoke all on function fiscal.audit_product_tax_treatment() from public, anon, authenticated;

drop trigger if exists wa_products_tax_treatment_audit on public.wa_products;
create trigger wa_products_tax_treatment_audit
  after update of tax_treatment on public.wa_products
  for each row execute function fiscal.audit_product_tax_treatment();

-- 4. Categoría efectiva de una línea ----------------------------------------------------------
create or replace function fiscal.line_tax_category(p_business_id uuid, p_sale_id uuid, p_item_id uuid)
returns text
language sql
stable
set search_path = pg_catalog, public, fiscal
as $$
  with l as (
    select i.id, i.product_id,
           md5(jsonb_build_array(i.product_id, i.name, i.description, i.unit_price, i.quantity,
                                 i.discount_pct, i.subtotal, i.sort_order, i.discount_type)::text) as fp
      from public.crm_invoice_items i
      join public.crm_invoices v on v.id = i.invoice_id and v.business_id = p_business_id
     where i.id = p_item_id and i.invoice_id = p_sale_id
  )
  select coalesce(
    (select t.category
       from fiscal.line_tax_verifications t, l
      where t.invoice_item_id = l.id and t.sale_id = p_sale_id and t.business_id = p_business_id
        and t.verified is true and t.category in ('IVA_AFECTO_19', 'EXENTO')
        and length(trim(coalesce(t.evidence, ''))) >= 15
        and t.line_fingerprint = l.fp
      order by t.created_at desc limit 1),
    (select p.tax_treatment from public.wa_products p, l
      where p.id = l.product_id and p.business_id = p_business_id),
    (select s.default_tax_category from fiscal.issuers s, l where s.business_id = p_business_id)
  );
$$;

-- Una venta se puede emitir como DTE 39 si tiene líneas y todas son afectas.
create or replace function fiscal.sale_tax_lines_verified(p_business_id uuid, p_sale_id uuid)
returns boolean
language sql
stable
set search_path = pg_catalog, public, fiscal
as $$
  select exists (select 1 from public.crm_invoice_items i where i.invoice_id = p_sale_id)
     and not exists (
       select 1 from public.crm_invoice_items i
        where i.invoice_id = p_sale_id
          and fiscal.line_tax_category(p_business_id, p_sale_id, i.id) is distinct from 'IVA_AFECTO_19');
$$;

-- 5. Contexto de emisión: categoría efectiva por línea ----------------------------------------
create or replace function public.crm_fiscal_emission_context(p_business_id uuid, p_sale_id uuid)
returns jsonb
language sql
stable
set search_path = public, fiscal
as $$
  select jsonb_build_object(
    'issuer', (select jsonb_build_object(
                        'issuer_rut', s.issuer_rut, 'enabled', s.enabled, 'verified', s.verified,
                        'sucursal_nombre', s.sucursal_nombre, 'sucursal_codigo', s.sucursal_codigo,
                        'resolucion_numero', s.resolucion_numero, 'resolucion_fecha', s.resolucion_fecha)
                 from fiscal.issuers s where s.business_id = p_business_id),
    'emission_enabled', exists (select 1 from fiscal.dte39_emission_control c where c.singleton and c.enabled),
    'tax_lines_verified', fiscal.sale_tax_lines_verified(p_business_id, p_sale_id),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'unit_price', i.unit_price,
                                          'quantity', i.quantity, 'discount_pct', i.discount_pct,
                                          'category', fiscal.line_tax_category(p_business_id, p_sale_id, i.id))
                       order by i.sort_order nulls last, i.id)
        from public.crm_invoice_items i
       where i.invoice_id = p_sale_id), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object('method', p.payment_method, 'amount', p.amount,
                                          'status', p.payment_status, 'voided', p.voided_at is not null))
        from public.crm_payments p
       where p.business_id = p_business_id and p.invoice_id = p_sale_id), '[]'::jsonb),
    'point_ops', coalesce((
      select jsonb_agg(jsonb_build_object('mp_status', o.mp_status, 'mp_order_id', o.mp_order_id,
                                          'mp_payment_id', o.mp_payment_id, 'finalized_at', o.finalized_at,
                                          'currency', o.currency, 'amount', o.amount))
        from public.crm_pos_point_operations o
       where o.business_id = p_business_id and o.crm_invoice_id = p_sale_id), '[]'::jsonb)
  );
$$;

-- 6. Categoría por defecto: lectura y escritura (la API exige fiscal_owner) -------------------
create or replace function public.crm_fiscal_set_tax_default(p_business_id uuid, p_actor_user_id uuid, p_category text)
returns boolean
language plpgsql
set search_path = public, fiscal
as $$
declare
  v_from text;
begin
  if p_business_id is null or p_actor_user_id is null
     or (p_category is not null and p_category not in ('IVA_AFECTO_19', 'EXENTO', 'NO_AFECTO')) then
    raise exception 'FISCAL_TAX_INVALID';
  end if;
  select default_tax_category into v_from from fiscal.issuers where business_id = p_business_id for update;
  if not found then
    raise exception 'FISCAL_CREDENTIALS_REQUIRED';
  end if;
  update fiscal.issuers set default_tax_category = p_category, updated_at = now() where business_id = p_business_id;
  insert into fiscal.admin_audit (business_id, sale_id, actor_user_id, action, outcome, detail)
  values (p_business_id, null, p_actor_user_id, 'tax_default_set', coalesce(p_category, 'cleared'),
          jsonb_build_object('from', v_from, 'to', p_category));
  return true;
end;
$$;

create or replace function public.crm_fiscal_connection_status(p_business_id uuid)
returns jsonb
language sql
stable
set search_path = public, fiscal
as $$
  select jsonb_build_object(
    'connected', c.business_id is not null,
    'issuerRut', i.issuer_rut,
    'enabled', coalesce(i.enabled, false),
    'verified', coalesce(i.verified, false),
    'keyVersion', c.key_version,
    'updatedAt', greatest(c.updated_at, i.updated_at),
    'reviewStatus', coalesce(i.review_status, 'draft'),
    'reviewNote', i.review_note,
    'submittedAt', i.submitted_at,
    'reviewedAt', i.reviewed_at,
    'resolucionNumero', i.resolucion_numero,
    'resolucionFecha', i.resolucion_fecha,
    'sucursalNombre', i.sucursal_nombre,
    'sucursalCodigo', i.sucursal_codigo,
    'defaultTaxCategory', i.default_tax_category)
  from (select p_business_id as bid) b
  left join fiscal.business_credentials c on c.business_id = b.bid
  left join fiscal.issuers i on i.business_id = b.bid;
$$;

-- 7. Permisos ----------------------------------------------------------------------------------
revoke all on function fiscal.line_tax_category(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function fiscal.sale_tax_lines_verified(uuid, uuid) from public, anon, authenticated;
revoke all on function public.crm_fiscal_emission_context(uuid, uuid) from public, anon, authenticated;
revoke all on function public.crm_fiscal_set_tax_default(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.crm_fiscal_connection_status(uuid) from public, anon, authenticated;
grant execute on function fiscal.line_tax_category(uuid, uuid, uuid) to service_role;
grant execute on function fiscal.sale_tax_lines_verified(uuid, uuid) to service_role;
grant execute on function public.crm_fiscal_emission_context(uuid, uuid) to service_role;
grant execute on function public.crm_fiscal_set_tax_default(uuid, uuid, text) to service_role;
grant execute on function public.crm_fiscal_connection_status(uuid) to service_role;

commit;
