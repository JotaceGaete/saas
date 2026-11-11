import {planDte39Finish} from './planDte39Finish.js';

// Persist only a locally rejected preflight for an already claimed job.
// Never accepts a caller-supplied folio or marks an operation issued.
export async function recordDte39PreflightFailure({db,job,error}) {
 if(!db || typeof db.rpc!=='function') throw new Error('DATABASE_REQUIRED');
 const args=planDte39Finish({job,phase:'preflight',error});
 const {data, error:dbError}=await db.rpc('sii_pos_dte39_finish',args);
 if(dbError) throw dbError;
 if(data!==true) throw new Error('FISCAL_JOB_NOT_CLAIMED');
 return {state:'failed',jobId:job.id,reason:args.p_error};
}
