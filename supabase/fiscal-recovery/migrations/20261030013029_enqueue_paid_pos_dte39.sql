-- Fiscal queue only: applies to completed POS sales regardless of tender type.
-- Does NOT call DTECore. Payment approval must already have been committed.
create or replace function fiscal.enqueue_paid_pos_dte39()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, fiscal
as $$
begin
  if new.source <> 'pos' or new.status <> 'pagada' or new.paid_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'pagada' and old.paid_at is not null then
    return new;
  end if;
  if not exists (
    select 1 from public.wa_businesses b
     where b.id = new.business_id and upper(coalesce(b.country_code,'')) = 'CL'
  ) then return new; end if;
  insert into fiscal.pos_dte39_outbox (business_id,invoice_id,operation_id)
  values (new.business_id,new.id,'WALINKA-DTE39-'||new.id::text)
  on conflict (business_id,invoice_id,document_type) do nothing;
  return new;
end;
$$;
revoke all on function fiscal.enqueue_paid_pos_dte39() from public, anon, authenticated;
drop trigger if exists crm_invoice_paid_pos_dte39_enqueue on public.crm_invoices;
create trigger crm_invoice_paid_pos_dte39_enqueue
after insert or update of status,paid_at on public.crm_invoices
for each row execute function fiscal.enqueue_paid_pos_dte39();
