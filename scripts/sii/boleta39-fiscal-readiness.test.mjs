import test from 'node:test';
import assert from 'node:assert/strict';
import {assessBoleta39FiscalReadiness} from './boleta39-fiscal-readiness.mjs';
const all={schemaValidated:true,taxRoundingVerified:true,fieldsReviewed:true,issuerAuthorized:true,
 cafVerified:true,signatureVerified:true,siiCertificationApproved:true};
test('every missing prerequisite blocks fiscal readiness',()=>{
 const reasons=['SCHEMA_NOT_VALIDATED','TAX_ROUNDING_NOT_VERIFIED','MANDATORY_FIELDS_NOT_REVIEWED',
  'ISSUER_NOT_AUTHORIZED','CAF_NOT_VERIFIED','SIGNATURE_NOT_VERIFIED','SII_CERTIFICATION_NOT_APPROVED'];
 Object.keys(all).forEach((key,i)=>{
  const state={...all,[key]:false};
  const result=assessBoleta39FiscalReadiness(state);
  assert.equal(result.reason,reasons[i]);
  assert.equal(result.transmittable,false);
  assert.equal(result.fiscalEligible,false);
 });
});
test('even self-reported all-true flags cannot unlock fiscal emission',()=>{
 const result=assessBoleta39FiscalReadiness(all);
 assert.equal(result.ok,false);
 assert.equal(result.reason,'SERVER_SIDE_EVIDENCE_REQUIRED');
 assert.equal(result.siiValidated,false);
 assert.equal(result.transmittable,false);
});
test('invalid input and empty input are rejected',()=>{
 assert.equal(assessBoleta39FiscalReadiness(null).reason,'INVALID_INPUT');
 assert.equal(assessBoleta39FiscalReadiness({}).reason,'SCHEMA_NOT_VALIDATED');
});
