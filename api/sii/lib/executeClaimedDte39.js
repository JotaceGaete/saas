// One claimed job, one provider attempt. This module never claims or retries jobs.
// Caller must persist the outcome via the atomic fiscal finish RPC.
import {authorizeDte39Dispatch} from './authorizeDte39Dispatch.js';
import {buildDte39Payload,emitDte39Claimed} from './dtecore39.js';
import {planDte39Finish} from './planDte39Finish.js';

export async function executeClaimedDte39({
 job,control,issuer,credentials,sale,emit=emitDte39Claimed
}) {
 let authorization,payload;
 try {
  authorization=authorizeDte39Dispatch({job,control,issuer,credentials});
  if (!sale || sale.operationId !== authorization.operationId)
   throw new Error('OPERATION_ID_MISMATCH');
  payload=buildDte39Payload(sale);
 } catch(error) {
  return {phase:'preflight',finish:planDte39Finish({job,phase:'preflight',error})};
 }
 try {
  const result=await emit({
   payload,apiKey:authorization.apiKey,baseUrl:authorization.baseUrl
  });
  return {phase:'provider',finish:planDte39Finish({job,phase:'provider',result})};
 } catch(error) {
  // Even HTTP failures or timeouts may have issued a real folio.
  // Never automatically resubmit an uncertain operation.
  return {phase:'provider',finish:planDte39Finish({job,phase:'provider',error})};
 }
}
