// Queue orchestration for one fiscal job. No scheduling, no automatic retries.
// Dependency injection keeps tenant secrets server-only and allows safe dry-run tests.
import {processClaimedDte39} from './processClaimedDte39.js';

export async function runNextDte39Job({db,loadControl,loadCredentials,process=processClaimedDte39}) {
 if (!db || typeof db.rpc!=='function') throw new Error('DATABASE_REQUIRED');
 if (typeof loadControl!=='function' || typeof loadCredentials!=='function')
  throw new Error('FISCAL_CONFIGURATION_LOADER_REQUIRED');
 const {data:claim,error:claimError}=await db.rpc('sii_pos_dte39_claim_next');
 if (claimError) throw claimError;
 if (!claim) return {status:'idle'};
 const jobId=claim.jobId;
 if (!jobId || !claim.businessId || !claim.operationId || claim.documentType!==39)
  throw new Error('INVALID_FISCAL_CLAIM');
 // Any failure after claim requires manual reconciliation. Do not re-claim.
 let snapshot;
 try {
  const {data,error}=await db.rpc('sii_pos_dte39_job_snapshot',{p_job_id:jobId});
  if (error) throw error;
  snapshot=data;
  if (!snapshot?.job || snapshot.job.id!==jobId ||
      snapshot.job.business_id!==claim.businessId ||
      snapshot.job.operation_id!==claim.operationId ||
      snapshot.job.state!=='claimed')
   throw new Error('FISCAL_SNAPSHOT_MISMATCH');
  const control=await loadControl();
  const credentials=await loadCredentials(claim.businessId);
  const result=await process({db,snapshot,control,credentials});
  return {status:'processed',...result};
 } catch(error) {
  // Do not mark a claimed job failed here: the provider may already have issued
  // before a persistence failure. An operator must inspect stale claims.
  const reason=String(error?.message||'FISCAL_JOB_ERROR');
  return {status:'requires_review',jobId,reason:/^[A-Z][A-Z0-9_]{2,80}$/.test(reason)?reason:'FISCAL_JOB_ERROR'};
 }
}
