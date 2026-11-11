// Store provider-verified evidence only. This never issues a DTE or updates the outbox.
import {assessDte39Reconciliation} from './assessDte39Reconciliation.js';

export async function recordVerifiedDte39Evidence({db,job,evidence,reference}) {
 if(!db || typeof db.rpc!=='function') throw new Error('DATABASE_REQUIRED');
 if(typeof reference!=='string' || !reference.trim()) throw new Error('EVIDENCE_REFERENCE_REQUIRED');
 const assessment=assessDte39Reconciliation({job,evidence});
 const {data,error}=await db.rpc('sii_pos_dte39_record_evidence',{
  p_job_id:job.id,p_operation_id:job.operation_id,
  p_reviewer:evidence.checkedBy,p_checked_at:evidence.checkedAt,
  p_status:evidence.status,p_folio:evidence.status==='issued'?evidence.folio:null,
  p_reference:reference.trim()
 });
 if(error) throw error;
 if(!data) throw new Error('EVIDENCE_NOT_RECORDED');
 return {evidenceId:data,decision:assessment.decision,suggestedState:assessment.suggestedState};
}
