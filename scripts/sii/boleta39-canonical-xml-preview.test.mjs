import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {serializeBoleta39CanonicalPreview} from './boleta39-canonical-xml-preview.mjs';
const cases=JSON.parse(readFileSync(new URL('./fixtures/artema-boleta39-set.json',import.meta.url),'utf8')).cases;
const issuer={rut:'76086428-5',legalName:'Empresa & prueba',businessActivity:'Comercio',address:'Calle 123',commune:'Santiago',resolutionDate:'2024-01-01',resolutionNumber:80};
const operation={documentType:39,folio:12,issuedOn:'2026-10-28'};
test('serializes all five certification cases from one canonical model',()=>{
 for(const c of cases){
  const r=serializeBoleta39CanonicalPreview({issuer,operation,certificationCase:c});
  assert.equal(r.ok,true);
  assert.match(r.xml,/<WalinkaNonFiscalCanonicalPreview>/);
  assert.match(r.xml,/<Folio>12<\/Folio>/);
  assert.match(r.xml,/Empresa &amp; prueba/);
  assert.match(r.xml,new RegExp('<MntTotal>'+c.expectedTotal+'</MntTotal>'));
  assert.match(r.xml,new RegExp('<RazonRef>'+c.id+'</RazonRef>'));
  assert.equal((r.xml.match(/<Detalle>/g)||[]).length,c.items.length);
  assert.equal(r.transmittable,false);
  assert.equal(r.schemaValid,false);
  assert.doesNotMatch(r.xml,/<(?:DTE|TED|CAF|Signature)(?:\s|>)/);
 }
});
test('exempt amount and weight unit are retained',()=>{
 const fourth=serializeBoleta39CanonicalPreview({issuer,operation,certificationCase:cases[3]});
 const fifth=serializeBoleta39CanonicalPreview({issuer,operation,certificationCase:cases[4]});
 assert.match(fourth.xml,/<MntExe>2000<\/MntExe>/);
 assert.match(fifth.xml,/<UnmdItem>Kg<\/UnmdItem>/);
});
test('bad issuer and modified case fail closed',()=>{
 const bad=serializeBoleta39CanonicalPreview({issuer:{...issuer,rut:'1-8'},operation,certificationCase:cases[0]});
 assert.equal(bad.ok,false);
 assert.equal(bad.xml,undefined);
 const tampered=structuredClone(cases[0]);tampered.items[0].quantity=42;
 const invalid=serializeBoleta39CanonicalPreview({issuer,operation,certificationCase:tampered});
 assert.equal(invalid.ok,false);
 assert.equal(invalid.reason,'UNTRUSTED_CERTIFICATION_CASE');
});
