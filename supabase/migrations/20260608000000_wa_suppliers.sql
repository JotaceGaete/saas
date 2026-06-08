-- wa_suppliers: gestión de proveedores y deudas
create table if not exists wa_suppliers (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references wa_businesses(id) on delete cascade,
  name        text not null,
  contact_name text,
  phone       text,
  email       text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists wa_supplier_debts (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references wa_businesses(id) on delete cascade,
  supplier_id uuid not null references wa_suppliers(id) on delete cascade,
  description text not null,
  amount      numeric(14,2) not null check (amount >= 0),
  due_date    date,
  paid_at     timestamptz,
  status      text not null default 'pending' check (status in ('pending','paid','overdue')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- índices de uso frecuente
create index if not exists wa_suppliers_business_id_idx on wa_suppliers(business_id);
create index if not exists wa_supplier_debts_supplier_id_idx on wa_supplier_debts(supplier_id);
create index if not exists wa_supplier_debts_business_id_idx on wa_supplier_debts(business_id);
create index if not exists wa_supplier_debts_status_idx on wa_supplier_debts(status);

-- triggers updated_at
create trigger wa_suppliers_updated_at
  before update on wa_suppliers
  for each row execute function wa_set_updated_at();

create trigger wa_supplier_debts_updated_at
  before update on wa_supplier_debts
  for each row execute function wa_set_updated_at();

-- RLS
alter table wa_suppliers enable row level security;
alter table wa_supplier_debts enable row level security;

-- wa_suppliers policies
create policy "suppliers_select" on wa_suppliers for select
  using (business_id in (select id from wa_businesses where user_id = auth.uid()));

create policy "suppliers_insert" on wa_suppliers for insert
  with check (business_id in (select id from wa_businesses where user_id = auth.uid()));

create policy "suppliers_update" on wa_suppliers for update
  using (business_id in (select id from wa_businesses where user_id = auth.uid()));

create policy "suppliers_delete" on wa_suppliers for delete
  using (business_id in (select id from wa_businesses where user_id = auth.uid()));

-- wa_supplier_debts policies
create policy "supplier_debts_select" on wa_supplier_debts for select
  using (business_id in (select id from wa_businesses where user_id = auth.uid()));

create policy "supplier_debts_insert" on wa_supplier_debts for insert
  with check (business_id in (select id from wa_businesses where user_id = auth.uid()));

create policy "supplier_debts_update" on wa_supplier_debts for update
  using (business_id in (select id from wa_businesses where user_id = auth.uid()));

create policy "supplier_debts_delete" on wa_supplier_debts for delete
  using (business_id in (select id from wa_businesses where user_id = auth.uid()));
