// Joins validated issuer/operation preview and the immutable official case candidate.
// Diagnostic container deliberately NOT in the SII namespace and NOT a DTE.
import {buildBoleta39HeaderPreview} from './boleta39-header-xml-preview.mjs';
import {buildBoleta39DocumentCandidate} from './boleta39-document-candidate.mjs';
export function buildBoleta39CombinedPreview({issuer,operation,certificationCase}={}){
 const header=buildBoleta39HeaderPreview({issuer,operation});
 if(!header.ok)return Object.freeze({ok:false,reason:header.reason,transmittable:false});
 if(!certificationCase)return Object.freeze({ok:false,reason:'CERTIFICATION_CASE_REQUIRED',transmittable:false});
 const candidate=buildBoleta39DocumentCandidate(certificationCase);
 // Strip XML declaration only; embed a well-formed independent DTE-shaped fragment.
 // This is NOT the SII EnvioBOLETA envelope, and must never be transmitted.
 const draft=candidate.xml.replace(/^<\?xml[^>]*\?>\s*/,'').trim();
 const xml=`<?xml version="1.0" encoding="UTF-8"?>
<WalinkaNonFiscalCombinedPreview version="1">
  ${header.xml}
  <CandidateCase>${draft}</CandidateCase>
</WalinkaNonFiscalCombinedPreview>
`;
 return Object.freeze({ok:true,xml,caseId:candidate.caseId,documentType:39,
  fiscalEligible:false,schemaValid:false,siiValidated:false,signed:false,transmittable:false});
}
