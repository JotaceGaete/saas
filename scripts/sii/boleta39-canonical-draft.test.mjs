import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildBoleta39CanonicalDraft} from './boleta39-canonical-draft.mjs';
const cases=JSON.parse(readFileSync(new URL('./fixtures/artema-boleta39-set.json',import.meta.url),'utf8')).cases;
const issuer={rut:'76086428-5',legalName:'Empresa de prueba',businessActivity:'Comercio',address:'Calle 123',commune:'Santiago',resolutionDate:'2024-01-01',resolutionNumber:80};
const operation={documentType:39,folio:12,issuedOn:'2026-10-28'};
test('all official cases produce a single consistent immutable draft',()=>{
 for(const c of cases){
  const result=buildBoleta39CanonicalDraft({issuer,operation,certificationCase:c});
  assert.equal(result.ok,true);
  assert.equal(result.draft.lines.length,c.items.length);
  assert.equal(result.draft.totals.gross,c.expectedTotal);
  assert.equal(result.draft.totals.affectedGross+result.draft.totals.exemptGross,c.expectedTotal);
  assert.equal(result.draft.reference.reason,c.id);
  assert.equal(result.draft.header.folio,12);
  assert.equal(result.draft.totals.roundingApproved,false);
  assert.equal(result.transmittable,false);
  assert.equal(result.schemaValid,false);
  assert.ok(Object.isFrozen(result.draft));
  assert.ok(Object.isFrozen(result.draft.lines));
  assert.ok(Object.isFrozen(result.draft.lines[0]));
 }
});
test('rejects tampered official certification data',()=>{
 const altered=structuredClone(cases[0]);altered.items[0].quantity++;
 const result=buildBoleta39CanonicalDraft({issuer,operation,certificationCase:altered});
 assert.equal(result.ok,false);
 assert.equal(result.reason,'UNTRUSTED_CERTIFICATION_CASE');
});
test('invalid header fails closed',()=>{
 const result=buildBoleta39CanonicalDraft({issuer:{...issuer,rut:'1-9'},operation,certificationCase:cases[0]});
 assert.equal(result.ok,false);
 assert.equal(result.reason,'INVALID_ISSUER_RUT');
});
