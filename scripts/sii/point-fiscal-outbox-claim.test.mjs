import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../../supabase/migrations/202610290002_point_fiscal_outbox_claim_pilot.sql',import.meta.url),'utf8');
test('claim uses row locking and atomic state transition',()=>{
 assert.match(sql,/for update skip locked/i);
 assert.match(sql,/set status='processing',attempts=q\.attempts\+1/i);
 assert.match(sql,/q\.status='pending'/);
 assert.match(sql,/p_limit < 1 or p_limit > 20/);
});
test('only service role can claim or complete and pilot is isolated',()=>{
 assert.equal((sql.match(/auth\.role\(\) is distinct from 'service_role'/g)||[]).length,2);
 assert.equal((sql.match(/cda904a1-e331-4bd4-9f33-a6715687d3dd/g)||[]).length,2);
 assert.match(sql,/where q\.id=p_id and q\.status='processing'/);
 assert.match(sql,/p_status not in \('prepared','blocked'\)/);
 assert.match(sql,/revoke all on function public\.crm_claim_point_fiscal_pilot/);
 assert.match(sql,/revoke all on function public\.crm_complete_point_fiscal_pilot/);
});
