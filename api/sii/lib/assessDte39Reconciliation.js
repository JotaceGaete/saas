// A reconciliation decision is human-reviewed, never an automatic POST retry.
// Provider evidence must be independently checked before any state change.
export function assessDte39Reconciliation({job,evidence}) {
 if(!job || !['unknown','claimed'].includes(job.state))
   throw new Error('RECONCILIATION_STATE_REQUIRED');
 if(!job.operation_id || !job.invoice_id || !job.business_id)
   throw new Error('JOB_IDENTITY_REQUIRED');
 if(!evidence || evidence.operationId!==job.operation_id)
   throw new Error('OPERATION_EVIDENCE_MISMATCH');
 if(evidence.source!=='dtecore_verified')
   throw new Error('PROVIDER_VERIFICATION_REQUIRED');
 if(typeof evidence.checkedBy!=='string' || !evidence.checkedBy.trim())
   throw new Error('REVIEWER_REQUIRED');
 if(typeof evidence.checkedAt!=='string' || !Number.isFinite(Date.parse(evidence.checkedAt)))
   throw new Error('REVIEW_TIME_REQUIRED');
 if(evidence.status==='issued') {
   if(!Number.isSafeInteger(evidence.folio)||evidence.folio<=0)
     throw new Error('VALID_FOLIO_REQUIRED');
   return {decision:'manual_review_required',suggestedState:'issued',
     operationId:job.operation_id,folio:evidence.folio};
 }
 if(evidence.status==='not_found')
   return {decision:'manual_review_required',suggestedState:'unknown',
     operationId:job.operation_id,reason:'NOT_FOUND_DOES_NOT_PROVE_NOT_ISSUED'};
 throw new Error('UNSUPPORTED_EVIDENCE_STATUS');
}
