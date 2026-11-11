// Pure plan for a previously claimed fiscal job. No network or DB side effects.
import {classifyDte39Outcome,classifyDte39Preflight} from './dte39Outcome.js';

export function planDte39Finish({job,phase,error,result}) {
 if(!job?.id || job.state!=='claimed' || job.document_type!==39)
   throw new Error('CLAIMED_JOB_REQUIRED');
 if(!['preflight','provider'].includes(phase)) throw new Error('INVALID_PHASE');
 const outcome=phase==='preflight'
   ? classifyDte39Preflight(error)
   : classifyDte39Outcome(error,result);
 if(phase==='preflight' && !error) throw new Error('PREFLIGHT_ERROR_REQUIRED');
 return {
   p_job_id:job.id,p_state:outcome.state,
   p_folio:outcome.state==='issued'?outcome.folio:null,
   p_response:outcome.state==='issued'?outcome.response:null,
   p_error:outcome.error||null
 };
}
