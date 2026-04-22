alter table public.wa_products
add column if not exists is_draft boolean;

update public.wa_products
set is_draft = false
where is_draft is null;

alter table public.wa_products
alter column is_draft set default false;

alter table public.wa_products
alter column is_draft set not null;

create index if not exists wa_products_business_id_is_draft_idx
on public.wa_products (business_id, is_draft);
