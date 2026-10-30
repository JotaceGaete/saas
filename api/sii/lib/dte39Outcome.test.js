import {describe,it,expect} from 'vitest';
import {classifyDte39Outcome,classifyDte39Preflight} from './dte39Outcome.js';
describe('DTE39 outcomes',()=>{
 it('accepts an actual folio',()=>expect(classifyDte39Outcome(null,{folio:123,isSimulation:false})).toMatchObject({state:'issued',folio:123}));
 it('never marks a simulation issued',()=>expect(classifyDte39Outcome(null,{folio:123,isSimulation:true}).state).toBe('unknown'));
 it('treats timeout as uncertain',()=>expect(classifyDte39Outcome(new Error('timeout')).state).toBe('unknown'));
 it('treats HTTP 500 as uncertain',()=>expect(classifyDte39Outcome({status:500}).state).toBe('unknown'));
 it('rejects missing folio',()=>expect(classifyDte39Outcome(null,{folio:null}).state).toBe('unknown'));
 it('marks local preflight failures failed',()=>expect(classifyDte39Preflight(new Error('ISSUER_NOT_VERIFIED'))).toEqual({state:'failed',error:'ISSUER_NOT_VERIFIED'}));
});
