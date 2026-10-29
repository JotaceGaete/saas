// SERVER ONLY. Certification pilot: no production emission.
// Adapters MUST enforce tenant authorization, immutable storage and atomic CAS.
import { createHash, timingSafeEqual } from 'node:crypto';

function validId(id) { return typeof id === 'string' && /^[A-Za-z0-9:_-]{1,128}$/.test(id); }
async function cas(deps,id,from,to,trackId) {
 // Return exactly true ONLY when a durable, atomic compare-and-swap committed.
 const committed=await deps.transition(id,from,to,trackId);
 if(committed!==true) throw new Error('Fiscal transition was not atomically committed');
}
export async function issueReserved({ id, deps }) {
 const required=['load','sign','validate','store','transition','submit'];
 if (!deps || required.some(k=>typeof deps[k]!=='function')) throw Error('Backend adapter missing');
 if(!validId(id)) throw Error('Invalid operation ID');
 const op=await deps.load(id);
 if(!op || !Number.isSafeInteger(op.folio)||op.folio<=0||op.documentType!==39) throw Error('Unreserved folio');
 if(['unknown','submitted','submitting','signed'].includes(op.state)) return {status:'reconcile_required',folio:op.folio};
 if(['accepted','rejected'].includes(op.state)) return {status:op.state,folio:op.folio};
 if(op.state!=='reserved') throw Error('Invalid issuance state');
 const document=await deps.sign(op);
 if(!document || !Buffer.isBuffer(document.xmlBytes) || document.xmlBytes.length===0 || document.xmlBytes.length>10485760 || !/^[a-f0-9]{64}$/.test(document.sha256||'')) throw Error('Invalid signed document');
 const actualHash=createHash('sha256').update(document.xmlBytes).digest();
 const suppliedHash=Buffer.from(document.sha256,'hex');
 if(!timingSafeEqual(actualHash,suppliedHash)) throw Error('Signed XML SHA-256 mismatch');
 if(await deps.validate(document,op)!==true) throw Error('Signed document validation failed');
 // Store must be immutable and idempotent by operation ID and digest.
 await deps.store(id,document);
 // A competing worker MUST NOT be allowed to submit unless it won CAS.
 await cas(deps,id,'reserved','signed');
 await cas(deps,id,'signed','submitting');
 let response;
 try { response=await deps.submit(id,document); }
 catch { /* Ambiguous network outcome: never resend automatically. */ }
 if(response?.confirmed===true && validId(response.trackId)) {
  await cas(deps,id,'submitting','submitted',response.trackId);
  return {status:'submitted',folio:op.folio,trackId:response.trackId};
 }
 await cas(deps,id,'submitting','unknown');
 return {status:'reconcile_required',folio:op.folio};
}
