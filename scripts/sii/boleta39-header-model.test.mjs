import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBoleta39HeaderModel} from './boleta39-header-model.mjs';
const issuer={rut:'76086428-5',legalName:'Empresa de prueba',businessActivity:'Comercio',address:'Calle de prueba 123',commune:'Santiago',resolutionDate:'2024-01-01',resolutionNumber:80};
const operation={documentType:39,folio:12,issuedOn:'2026-10-28'};
test('offline header preserves mapped fields but never enables issuance',()=>{
 const result=buildBoleta39HeaderModel({issuer,operation});
 assert.equal(result.ok,true);
 assert.equal(result.header.issuer.rut,issuer.rut);
 assert.equal(result.header.folio,12);
 assert.equal(result.fiscalEligible,false);
 assert.equal(result.transmittable,false);
 assert.equal(result.requiresOfficialSchemaValidation,true);
});
test('rejects missing or invalid issuer and operation data',()=>{
 const cases=[
  [{...issuer,rut:'12345678-9'},operation,'INVALID_ISSUER_RUT'],
  [{...issuer,rut:'76.086.428-5'},operation,'INVALID_ISSUER_RUT'],
  [{...issuer,legalName:'<script>'},operation,'INVALID_ISSUER_NAME'],
  [{...issuer,resolutionDate:'2026-02-30'},operation,'INVALID_RESOLUTION_DATE'],
  [{...issuer,resolutionNumber:-1},operation,'INVALID_RESOLUTION_NUMBER'],
  [issuer,{...operation,folio:0},'INVALID_FOLIO'],
  [issuer,{...operation,documentType:33},'DOCUMENT_TYPE_NOT_39'],
  [issuer,{...operation,issuedOn:'2026-13-01'},'INVALID_ISSUE_DATE']
 ];
 for(const [i,o,reason] of cases)assert.equal(buildBoleta39HeaderModel({issuer:i,operation:o}).reason,reason);
});
test('does not accept absent fields or implicit defaults',()=>{
 assert.equal(buildBoleta39HeaderModel().reason,'ISSUER_REQUIRED');
 assert.equal(buildBoleta39HeaderModel({issuer}).reason,'OPERATION_REQUIRED');
});
