// Canonical, offline boleta 39 draft model. Never authorize issuance from this object.
// The official case is integrity-checked; amounts remain gross and IVA is NOT finalized.
import {buildBoleta39HeaderModel} from './boleta39-header-model.mjs';
import {verifyOfficialBoletaCase} from './boleta39-set-integrity.mjs';
import {inspectBoletaSetCase} from './boleta39-set-arithmetic.mjs';
const freezeLine=x=>Object.freeze({...x});
export function buildBoleta39CanonicalDraft({issuer,operation,certificationCase}={}){
 const h=buildBoleta39HeaderModel({issuer,operation});
 if(!h.ok)return Object.freeze({ok:false,reason:h.reason,transmittable:false});
 if(!certificationCase)return Object.freeze({ok:false,reason:'CERTIFICATION_CASE_REQUIRED',transmittable:false});
 if(!verifyOfficialBoletaCase(certificationCase).ok)return Object.freeze({ok:false,reason:'UNTRUSTED_CERTIFICATION_CASE',transmittable:false});
 const t=inspectBoletaSetCase(certificationCase);
 if(!t.matchesFixture)return Object.freeze({ok:false,reason:'TOTAL_MISMATCH',transmittable:false});
 const lines=Object.freeze(t.lines.map(freezeLine));
 const draft=Object.freeze({
  documentType:39,caseId:certificationCase.id,
  header:h.header,
  receptor:Object.freeze({rut:'66666666-6'}),
  lines,
  totals:Object.freeze({gross:t.gross,affectedGross:t.affectedGross,exemptGross:t.exemptGross,
   indicativeNet:t.indicativeNet,indicativeIva:t.indicativeIva,roundingApproved:false}),
  reference:Object.freeze({code:'SET',reason:certificationCase.id}),
 });
 return Object.freeze({ok:true,draft,fiscalEligible:false,schemaValid:false,
  siiValidated:false,signed:false,transmittable:false});
}
