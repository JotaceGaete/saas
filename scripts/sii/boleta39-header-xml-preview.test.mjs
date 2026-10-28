import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBoleta39HeaderPreview} from './boleta39-header-xml-preview.mjs';
const issuer={rut:'76086428-5',legalName:'Comercio & Servicios',businessActivity:'Venta de insumos',address:'Calle 123',commune:'Santiago',resolutionDate:'2024-01-01',resolutionNumber:80};
const operation={documentType:39,folio:123,issuedOn:'2026-10-28'};
test('preview serializes validated header while remaining non-fiscal',()=>{
 const result=buildBoleta39HeaderPreview({issuer,operation});
 assert.equal(result.ok,true);
 assert.match(result.xml,/WalinkaNonFiscalHeaderPreview/);
 assert.match(result.xml,/<TipoDTE>39<\/TipoDTE>/);
 assert.match(result.xml,/<Folio>123<\/Folio>/);
 assert.match(result.xml,/Comercio &amp; Servicios/);
 assert.match(result.xml,/<FchResol>2024-01-01<\/FchResol>/);
 assert.equal(result.transmittable,false);
 assert.equal(result.schemaValid,false);
 assert.doesNotMatch(result.xml,/<(?:DTE|TED|CAF|Signature)(?:\s|>)/);
});
test('invalid fiscal metadata cannot be serialized',()=>{
 const result=buildBoleta39HeaderPreview({issuer:{...issuer,rut:'123-4'},operation});
 assert.equal(result.ok,false);
 assert.equal(result.reason,'INVALID_ISSUER_RUT');
 assert.equal(result.transmittable,false);
 assert.equal(result.xml,undefined);
});
