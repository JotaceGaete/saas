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

test('tax evidence is bound to all invoiced line fields and old evidence is invalid',()=>{
 assert.match(sql,/add column if not exists line_fingerprint text/);
 assert.match(sql,/t\.line_fingerprint = md5\(jsonb_build_array\(i\.product_id,i\.name,i\.description,i\.unit_price,i\.quantity,i\.discount_pct,i\.subtotal,i\.sort_order,i\.discount_type\)::text\)/);
 assert.match(sql,/v_fingerprint:=md5\(jsonb_build_array\(v_item\.product_id,v_item\.name,v_item\.description,v_item\.unit_price,v_item\.quantity,v_item\.discount_pct,v_item\.subtotal,v_item\.sort_order,v_item\.discount_type\)::text\)/);
 assert.match(sql,/line_fingerprint=excluded\.line_fingerprint/);
 assert.match(sql,/for share/);
});
