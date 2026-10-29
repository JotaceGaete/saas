import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../../supabase/migrations/202610290001_point_fiscal_outbox_pilot.sql',import.meta.url),'utf8');
test('outbox is pilot-only and requires persisted finalized Point operation',()=>{
 for(const token of [
  "new.business_id = 'cda904a1-e331-4bd4-9f33-a6715687d3dd'::uuid",
  "new.mp_status = 'processed'","new.finalized_at is not null",
  "new.crm_invoice_id is not null","new.mp_order_id is not null",
  "new.mp_payment_id is not null","new.external_reference is not null",
  "new.currency = 'CLP'","new.amount > 0"
 ]) assert.ok(sql.includes(token),token);
});
test('outbox is idempotent, RLS-protected and not executable by cashier',()=>{
 assert.match(sql,/point_operation_id uuid not null unique/);
 assert.match(sql,/on conflict \(point_operation_id\) do nothing/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all on public\.crm_point_fiscal_outbox from public, anon, authenticated/);
 assert.match(sql,/after insert or update of finalized_at,crm_invoice_id,mp_status/);
 assert.doesNotMatch(sql,/\b(http_post|net\.http_post|emitirBoleta|pg_cron|cron\.schedule)\s*\(/i);
});
