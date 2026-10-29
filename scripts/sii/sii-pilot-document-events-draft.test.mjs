import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('./sql/sii-pilot-document-events-DRAFT.sql',import.meta.url),'utf8');
test('draft audit schema is explicitly isolated and denies direct client access',()=>{
 assert.match(sql,/OFFLINE DESIGN DRAFT ONLY/);
 assert.match(sql,/enable row level security/i);
 assert.match(sql,/revoke all on public\.sii_pilot_document_events from anon, authenticated/i);
 assert.doesNotMatch(sql,/create policy/i);
});
test('audit history forbids updates and deletes and retains tenant reference',()=>{
 assert.match(sql,/before update or delete on public\.sii_pilot_document_events/i);
 assert.match(sql,/raise exception 'SII_PILOT_AUDIT_APPEND_ONLY'/);
 assert.match(sql,/business_id uuid not null/);
 assert.match(sql,/references public\.sii_pilot_documents\(id\) on delete restrict/i);
});
test('audit draft cannot claim atomic writes or irreversible DBA protections',()=>{
 assert.match(sql,/does NOT enforce that atomicity/);
 assert.match(sql,/database owner\/superuser can still alter/i);
});
