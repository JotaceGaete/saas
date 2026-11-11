import {describe,it,expect} from 'vitest';
import {planDte39Finish} from './planDte39Finish.js';
const job={id:'job-1',state:'claimed',document_type:39};
describe('fiscal outbox finish plan',()=>{
 it('records successful folio',()=>expect(planDte39Finish({job,phase:'provider',result:{folio:456}})).toMatchObject({p_state:'issued',p_folio:456,p_error:null}));
 it('records timeout as unknown, never failed',()=>expect(planDte39Finish({job,phase:'provider',error:new Error('timeout')})).toMatchObject({p_state:'unknown',p_folio:null}));
 it('records preflight rejection as failed',()=>expect(planDte39Finish({job,phase:'preflight',error:new Error('ISSUER_NOT_VERIFIED')})).toMatchObject({p_state:'failed',p_error:'ISSUER_NOT_VERIFIED'}));
 it('rejects unclaimed job',()=>expect(()=>planDte39Finish({job:{...job,state:'pending'},phase:'provider'})).toThrow('CLAIMED_JOB_REQUIRED'));
 it('rejects absent preflight error',()=>expect(()=>planDte39Finish({job,phase:'preflight'})).toThrow('PREFLIGHT_ERROR_REQUIRED'));
});
