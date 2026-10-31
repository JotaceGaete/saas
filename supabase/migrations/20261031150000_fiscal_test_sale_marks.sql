-- ============================================================================
-- Marca de ventas de PRUEBA técnica con boleta real (DTE 39).
--
-- NO APLICAR A PRODUCCIÓN sin autorización expresa.
--
-- La marca vive en una tabla aparte. No modifica crm_invoices, pagos, ni
-- crm_fiscal_issuances, y no oculta ningún registro tributario: las boletas
-- de prueba siguen existiendo ante el SII y en el libro fiscal. Sirve para
-- excluirlas de informes comerciales, no para borrarlas.
-- ============================================================================

create table if not exists public.fiscal_test_sales (
  business_id uuid not null,
  sale_id uuid primary key,
  reason text not null default 'PRUEBA_TECNICA_SII' check (reason = 'PRUEBA_TECNICA_SII'),
  marked_at timestamptz not null default now(),
  constraint fiscal_test_sales_sale_fk foreign key (sale_id, business_id)
    references public.crm_invoices(id, business_id)
);

alter table public.fiscal_test_sales enable row level security;
revoke all on public.fiscal_test_sales from public, anon, authenticated;
-- Append-only for the backend: no update or delete grant.
grant select, insert on public.fiscal_test_sales to service_role;
comment on table public.fiscal_test_sales is
  'Technical test sales with real fiscal documents. Exclude from commercial reports only. Never delete fiscal records.';
