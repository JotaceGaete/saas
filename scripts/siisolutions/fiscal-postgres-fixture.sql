-- Disposable PostgreSQL CI fixture. Never run against a real Walinka database.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create table public.wa_businesses (id uuid primary key);
create table public.crm_invoices (id uuid primary key, business_id uuid not null);
insert into public.wa_businesses values
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222');
insert into public.crm_invoices values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222');
