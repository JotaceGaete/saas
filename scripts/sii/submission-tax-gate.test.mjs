import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../../supabase/migrations/202610290003_sii_submission_tax_gate_pilot.sql',import.meta.url),'utf8');
test('submission checks issuer, sale and line tax evidence before transition',()=>{
 for(const pattern of [/auth\.role\(\)/,/v_issuer\.verified is distinct from true/,/v_sale\.status <> 'pagada'/,/v_lines=0/,/t\.verified is true/,/t\.category in \('IVA_AFECTO_19','EXENTO'\)/,/length\(trim\(coalesce\(t\.evidence,''\)\)\)>=15/,/v_verified<>v_lines/,/TAX_LINES_NOT_FULLY_VERIFIED/])assert.match(sql,pattern);
 assert.ok(sql.indexOf('TAX_LINES_NOT_FULLY_VERIFIED')<sql.indexOf("status='submitting'"));
});
test('only service role may initiate submission',()=>{
 assert.match(sql,/revoke all on function public\.sii_pilot_begin_submission\(uuid\) from public, anon, authenticated/);
 assert.match(sql,/grant execute on function public\.sii_pilot_begin_submission\(uuid\) to service_role/);
});
