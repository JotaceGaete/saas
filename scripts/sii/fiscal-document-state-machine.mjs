// Offline DTE state machine. No signatures, CAF, SII calls or database writes.
const transitions=Object.freeze({
 draft:['pending_signature'],
 pending_signature:['draft','signed'],
 signed:['submitted'],
 submitted:['accepted','rejected'],
 rejected:[],
 accepted:[],
 voided_folio:[]
});
const allowedEvidence=Object.freeze({
 signed:'signatureDigest',
 submitted:'submissionId',
 accepted:'siiReceiptId',
 rejected:'siiReceiptId'
});
export function transitionFiscalDocument({document,event,actor,at,evidence={}}={}){
 if(!document||typeof document!=='object'||!Object.hasOwn(transitions,document.status))
  throw Error('UNKNOWN_DOCUMENT_STATE');
 if(!event||!transitions[document.status].includes(event.to))throw Error('FORBIDDEN_TRANSITION');
 if(typeof actor!=='string'||!actor.trim())throw Error('ACTOR_REQUIRED');
 if(typeof at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(at)||
   Number.isNaN(Date.parse(at)))throw Error('INVALID_TIMESTAMP');
 const key=allowedEvidence[event.to];
 if(key&&(typeof evidence[key]!=='string'||!evidence[key].trim()))
  throw Error('EVIDENCE_REQUIRED');
 if(typeof document.id!=='string'||!document.id.trim()||
    typeof document.businessId!=='string'||!document.businessId.trim())throw Error('DOCUMENT_IDENTITY_REQUIRED');
 const next=Object.freeze({...document,status:event.to});
 const audit=Object.freeze({documentId:document.id,businessId:document.businessId,
  from:document.status,to:event.to,actor,at,evidence:Object.freeze({...evidence})});
 return Object.freeze({document:next,audit,fiscalEligible:false,transmittable:false});
}
