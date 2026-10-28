import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRut,prepareSyntheticBoleta39FiscalFields as prepare} from './boleta39-fiscal-fields.mjs';
const base=()=>({issuerRut:'12.345.678-5',folio:7,cafFrom:1,cafTo:10,issueDate:'2026-10-28',resolutionDate:'2026-01-01',resolutionNumber:0});
test('normalizes verified RUT check digit without claiming SII authorization',()=>{
 assert.equal(normalizeRut('12.345.678-5'),'12345678-5');
 const r=prepare(base());
 assert.equal(r.ok,true);
 assert.equal(r.typeDte,39);
 assert.equal(r.cafVerified,false);
 assert.equal(r.authorizationVerified,false);
 assert.equal(r.fiscalEligible,false);
 assert.equal(r.transmittable,false);
});
test('rejects invalid RUT and noncanonical RUT formats',()=>{
 for(const rut of ['12.345.678-9','123456785','12.345.678-X','',null]) {
  assert.equal(prepare({...base(),issuerRut:rut}).reason,'INVALID_ISSUER_RUT');
 }
});
test('rejects folio outside synthetic CAF range and fractional values',()=>{
 for(const folio of [0,11,1.5,Number.MAX_SAFE_INTEGER+1])
  assert.equal(prepare({...base(),folio}).reason,'FOLIO_OUT_OF_RANGE');
});
test('rejects invalid dates and resolutions',()=>{
 assert.equal(prepare({...base(),issueDate:'2026-02-30'}).reason,'INVALID_FISCAL_DATES');
 assert.equal(prepare({...base(),resolutionDate:'2026-11-01'}).reason,'INVALID_FISCAL_DATES');
 assert.equal(prepare({...base(),resolutionNumber:-1}).reason,'INVALID_RESOLUTION_NUMBER');
});
