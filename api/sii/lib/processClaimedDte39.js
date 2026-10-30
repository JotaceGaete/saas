// Service-role worker core: one already claimed fiscal job, one provider attempt.
// Caller owns claim scheduling and tenant credential lookup. Never retries POST.
import {prepareClaimedDte39Dispatch} from './prepareClaimedDte39Dispatch.js';
import {emitDte39Claimed} from './dtecore39.js';
import {planDte39Finish} from './planDte39Finish.js';

export async function processClaimedDte39({
 db,snapshot,control,credentials,emit=emitDte39Claimed
}) {
 if (!db || typeof db.rpc!=='function') throw new Error('DATABASE_REQUIRED');
 const job=snapshot?.job;
 if (!job?.id || job.state!=='claimed' || job.document_type!==39)
  throw new Error('CLAIMED_JOB_REQUIRED');
 let plan,phase='preflight',error,result;
 try {
  plan=prepareClaimedDte39Dispatch({snapshot,control,credentials});
 } catch(e) { error=e; }
 if (plan) {
  phase='provider';
  try {
   result=await emit({
    payload:plan.payload,
    apiKey:plan.authorization.apiKey,
    baseUrl:plan.authorization.baseUrl
   });
  } catch(e) { error=e; }
 }
 const args=planDte39Finish({job,phase,error,result});
 // Failure to persist is NOT permission to repeat the provider operation.
 const {data,error:dbError}=await db.rpc('sii_pos_dte39_finish',args);
 if (dbError) throw dbError;
 if (data!==true) throw new Error('FISCAL_FINISH_NOT_PERSISTED');
 return {jobId:job.id,state:args.p_state,folio:args.p_folio??null};
}
