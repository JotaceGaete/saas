// Server-only, pure state transitions. Persist with optimistic locking and unique DB constraints.
export const STATES = Object.freeze(['draft','reserved','signed','submitting','submitted','accepted','rejected','unknown','cancelled']);
const ALLOWED = Object.freeze({
 draft:['reserved','cancelled'], reserved:['signed','cancelled'], signed:['submitting'],
 submitting:['submitted','unknown'], submitted:['accepted','rejected','unknown'],
 unknown:['submitted','accepted','rejected'], accepted:[], rejected:[], cancelled:[]
});
const checkId = (v) => { if(typeof v!=='string'||! /^[A-Za-z0-9:_-]{1,128}$/.test(v)) throw Error('Identificador inválido'); return v; };
const checkFolio = (v) => { if(!Number.isSafeInteger(v)||v<=0) throw Error('Folio inválido'); return v; };
const checkTime = (v) => { if(typeof v!=='string'||! /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(v)||Number.isNaN(Date.parse(v))) throw Error('Fecha UTC inválida'); return v; };
export function newFiscalOperation({businessId,saleId,issuerRut,now}) {
 checkId(businessId); checkId(saleId); checkTime(now);
 if(typeof issuerRut!=='string'||! /^\d{1,8}-[0-9K]$/.test(issuerRut)) throw Error('RUT no normalizado');
 return Object.freeze({businessId,saleId,issuerRut,documentType:39,state:'draft',folio:null,trackId:null,version:0,updatedAt:now,idempotencyKey:`CL:${businessId}:${saleId}:39`});
}
export function advanceFiscalOperation(snapshot,{to,now,folio,trackId}) {
 if(!snapshot||!Object.hasOwn(ALLOWED,snapshot.state)||!ALLOWED[snapshot.state].includes(to)) throw Error('Transición fiscal prohibida');
 checkTime(now);
 if(Date.parse(now)<Date.parse(snapshot.updatedAt)) throw Error('Tiempo retrocedió');
 if(!Number.isSafeInteger(snapshot.version)||snapshot.version<0) throw Error('Versión inválida');
 let nextFolio=snapshot.folio;
 if(to==='reserved'){if(nextFolio!==null) throw Error('Folio ya reservado');nextFolio=checkFolio(folio);}
 else if(folio!==undefined) throw Error('Reasignación de folio prohibida');
 if(!['cancelled','reserved'].includes(to)) checkFolio(nextFolio);
 let nextTrack=snapshot.trackId;
 if(trackId!==undefined){
  if(to!=='submitted'||(nextTrack!==null&&nextTrack!==trackId)) throw Error('Track ID inmutable');
  nextTrack=checkId(trackId);
 }
 if(['submitted','accepted','rejected'].includes(to)&&nextTrack===null) throw Error('Track ID obligatorio');
 return Object.freeze({...snapshot,state:to,folio:nextFolio,trackId:nextTrack,version:snapshot.version+1,updatedAt:now});
}
