-- PILOT ONLY. Apply separately after review; never issues a DTE.
-- Outbox captures all Point finalization paths (polling, webhook, reconcile)
-- through the same persisted operation transition, independent of the browser.
create table if not exists public.crm_point_fiscal_outbox (
 id uuid primary key default gen_random_uuid(),
 point_operation_id uuid not null unique references public.crm_pos_point_operations(id),
 business_id uuid not null,
 sale_id uuid not null,
 status text not null default 'pending'
  check (status in ('pending','processing','prepared','blocked')),
 attempts integer not null default 0 check (attempts >= 0),
 last_error_code text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists crm_point_fiscal_outbox_pending_idx
 on public.crm_point_fiscal_outbox(created_at) where status='pending';
alter table public.crm_point_fiscal_outbox enable row level security;
revoke all on public.crm_point_fiscal_outbox from public, anon, authenticated;
grant select,insert,update,delete on public.crm_point_fiscal_outbox to service_role;
create or replace function public.crm_enqueue_point_fiscal_pilot()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
 if new.business_id = 'cda904a1-e331-4bd4-9f33-a6715687d3dd'::uuid
    and new.mp_status = 'processed'
    and new.finalized_at is not null
    and new.crm_invoice_id is not null
    and new.mp_order_id is not null
    and new.mp_payment_id is not null
    and new.external_reference is not null
    and new.currency = 'CLP'
    and new.amount > 0 then
   insert into public.crm_point_fiscal_outbox(point_operation_id,business_id,sale_id)
   values(new.id,new.business_id,new.crm_invoice_id)
   on conflict (point_operation_id) do nothing;
 end if;
 return new;
end;
$$;
revoke all on function public.crm_enqueue_point_fiscal_pilot() from public,anon,authenticated;
drop trigger if exists trg_enqueue_point_fiscal_pilot on public.crm_pos_point_operations;
create trigger trg_enqueue_point_fiscal_pilot
 after insert or update of finalized_at,crm_invoice_id,mp_status
 on public.crm_pos_point_operations
 for each row execute function public.crm_enqueue_point_fiscal_pilot();
-- No scheduler, worker, external API call, tax document, or retroactive backfill.
