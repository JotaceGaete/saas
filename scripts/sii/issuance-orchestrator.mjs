// SERVER ONLY: fail-closed fiscal issuance orchestration.
// Dependencies are trusted backend adapters, never browser-supplied.
export async function issueReserved({ id, deps }) {
 const required=['load','sign','validate','store','transition','submit'];
 if (!deps || required.some(k=>typeof deps[k]!=='function')) throw Error('Backend adapter missing');
 if(typeof id!=='string'|| !/^[A-Za-z0-9:_-]{1,128}$/.test(id)) throw Error('Invalid operation ID');
 const op=await deps.load(id);
 if(!op || !Number.isSafeInteger(op.folio)||op.folio<=0||op.documentType!==39) throw Error('Unreserved folio');
 if(['unknown','submitted','submitting','signed'].includes(op.state)) return {status:'reconcile_required',folio:op.folio};
 if(['accepted','rejected'].includes(op.state)) return {status:op.state,folio:op.folio};
 if(op.state!=='reserved') throw Error('Invalid issuance state');
 const document=await deps.sign(op);
 if(!document || !Buffer.isBuffer(document.xmlBytes) || document.xmlBytes.length===0 || document.xmlBytes.length>10485760 || !/^[a-f0-9]{64}$/.test(document.sha256||'')) throw Error('Invalid signed document');
 if(await deps.validate(document,op)!==true) throw Error('Signed document validation failed');
 await deps.store(id,document); // must be immutable and durable
 await deps.transition(id,'reserved','signed'); // compare-and-swap
 await deps.transition(id,'signed','submitting'); // commit before network call
 try {
  const result=await deps.submit(id,document);
  if(result?.confirmed===true && typeof result.trackId==='string' && /^[A-Za-z0-9:_-]{1,128}$/.test(result.trackId)) {
   await deps.transition(id,'submitting','submitted',result.trackId);
   return {status:'submitted',folio:op.folio,trackId:result.trackId};
  }
 } catch {
  // Network errors may mean SII received the document.
 }
 // If transition fails, keep submitting state for recovery; never retry send.
 await deps.transition(id,'submitting','unknown');
 return {status:'reconcile_required',folio:op.folio};
}
