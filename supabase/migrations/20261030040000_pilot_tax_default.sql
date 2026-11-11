create table if not exists fiscal.business_tax_defaults (
 business_id uuid primary key references public.wa_businesses(id) on delete cascade,
 default_is_exempt boolean not null default false,
 confirmed_by_owner boolean not null default false,
 confirmed_at timestamptz,
 updated_at timestamptz not null default now(),
 constraint tax_default_confirmation_consistent check (not confirmed_by_owner or confirmed_at is not null)
);
alter table fiscal.business_tax_defaults enable row level security;
revoke all on fiscal.business_tax_defaults from public, anon, authenticated;
insert into fiscal.business_tax_defaults(business_id,default_is_exempt,confirmed_by_owner,confirmed_at)
values ('cda904a1-e331-4bd4-9f33-a6715687d3dd',false,true,now())
on conflict (business_id) do update
set default_is_exempt=false,confirmed_by_owner=true,confirmed_at=coalesce(fiscal.business_tax_defaults.confirmed_at,now()),updated_at=now();
-- This is a tax configuration, not an authorization to emit.
