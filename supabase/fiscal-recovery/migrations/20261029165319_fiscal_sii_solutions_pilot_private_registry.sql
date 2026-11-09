create schema if not exists fiscal;
revoke all on schema fiscal from public, anon, authenticated;
create table if not exists fiscal.issuers (
 business_id uuid primary key references public.wa_businesses(id) on delete restrict,
 issuer_rut text not null check (issuer_rut ~ '^[0-9]{1,8}-[0-9K]$'),
 provider text not null default 'sii_solutions' check (provider='sii_solutions'),
 enabled boolean not null default false,
 verified boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists fiscal.operations (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.wa_businesses(id) on delete restrict,
 sale_id uuid not null references public.crm_invoices(id) on delete restrict,
 issuer_rut text not null,
 document_type smallint not null default 39 check(document_type=39),
 operation_key text not null unique,
 status text not null default 'pending' check(status in ('pending','submitting','submitted','accepted','rejected','unknown','cancelled')),
 folio bigint check(folio > 0),
 provider_response_id text,
 error_code text,
 snapshot jsonb not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(business_id,sale_id,document_type),
 unique(issuer_rut,document_type,folio),
 foreign key(business_id) references fiscal.issuers(business_id)
);
create index if not exists fiscal_operations_reconcile_idx on fiscal.operations(status,updated_at) where status in ('submitting','unknown','submitted');
alter table fiscal.issuers enable row level security;
alter table fiscal.operations enable row level security;
revoke all on all tables in schema fiscal from public,anon,authenticated;
revoke all on all sequences in schema fiscal from public,anon,authenticated;
grant usage on schema fiscal to service_role;
grant select,insert,update on fiscal.issuers,fiscal.operations to service_role;
comment on schema fiscal is 'Private fiscal pilot; issuance disabled by default. No secrets stored in these tables.';