-- Prevent accidental duplicate submissions through outbox requeueing.
-- Recovery of uncertain outcomes must use a separately reviewed reconciliation path.
create or replace function fiscal.protect_dte39_outbox_transition()
returns trigger language plpgsql
set search_path=pg_catalog,fiscal as $$
begin
 if new.operation_id is distinct from old.operation_id
    or new.invoice_id is distinct from old.invoice_id
    or new.business_id is distinct from old.business_id
    or new.document_type is distinct from old.document_type then
   raise exception 'FISCAL_JOB_IDENTITY_IMMUTABLE';
 end if;
 if old.state in ('unknown','issued') and new.state is distinct from old.state then
   raise exception 'FISCAL_FINAL_STATE_LOCKED';
 end if;
 if old.state='claimed' and new.state='pending' then
   raise exception 'FISCAL_REQUEUE_FORBIDDEN';
 end if;
 if old.state='issued' and new.folio is distinct from old.folio then
   raise exception 'FISCAL_FOLIO_IMMUTABLE';
 end if;
 return new;
end; $$;
drop trigger if exists protect_dte39_outbox_transition on fiscal.pos_dte39_outbox;
create trigger protect_dte39_outbox_transition
before update on fiscal.pos_dte39_outbox
for each row execute function fiscal.protect_dte39_outbox_transition();
revoke all on function fiscal.protect_dte39_outbox_transition() from public,anon,authenticated;