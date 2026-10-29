// Offline, scoped folio reconciliation. Does not create or transmit DTEs.
const validDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) &&
  !Number.isNaN(Date.parse(d)) && new Date(d).toISOString().slice(0,10) === d;
const ranges = numbers => {
  const sorted = [...numbers].sort((a,b)=>a-b), output=[];
  for (const n of sorted) {
    const last=output.at(-1);
    if (last && last.end+1===n) last.end=n;
    else output.push({start:n,end:n});
  }
  return Object.freeze(output.map(x=>Object.freeze(x)));
};
export function reconcileScopedFolios({issuerRut,documentType,day,entries}={}) {
  if(typeof issuerRut!=='string'||!/^\d{1,8}-[\dkK]$/.test(issuerRut)) throw Error('INVALID_ISSUER');
  if(![39,41].includes(documentType)) throw Error('UNSUPPORTED_DOCUMENT_TYPE');
  if(!validDate(day)) throw Error('INVALID_DAY');
  if(!Array.isArray(entries)) throw Error('ENTRIES_REQUIRED');
  const seen=new Set(),used=[],voided=[];
  let issued=0,total=0,exemptTotal=0;
  for(const e of entries) {
    if(!e||e.issuerRut!==issuerRut||e.documentType!==documentType||e.day!==day)
      throw Error('SCOPE_MISMATCH');
    if(!Number.isSafeInteger(e.folio)||e.folio<=0||seen.has(e.folio))
      throw Error('INVALID_OR_DUPLICATE_FOLIO');
    seen.add(e.folio);used.push(e.folio);
    if(e.status==='voided'){
      if(e.amount!==undefined||e.exemptAmount!==undefined) throw Error('VOIDED_WITH_AMOUNT');
      voided.push(e.folio);
    }else if(e.status==='issued'){
      if(!Number.isSafeInteger(e.amount)||e.amount<0||
         !Number.isSafeInteger(e.exemptAmount??0)||e.exemptAmount<0||
         e.exemptAmount>e.amount) throw Error('INVALID_AMOUNT');
      if(documentType===41 && e.exemptAmount!==e.amount) throw Error('EXEMPT_TOTAL_MISMATCH');
      issued++;total+=e.amount;exemptTotal+=e.exemptAmount??0;
      if(!Number.isSafeInteger(total)||!Number.isSafeInteger(exemptTotal)) throw Error('TOTAL_OVERFLOW');
    }else throw Error('INVALID_STATUS');
  }
  return Object.freeze({issuerRut,documentType,day,issued,voided:voided.length,
    used:seen.size,total,exemptTotal,affectedTotal:total-exemptTotal,
    usedRanges:ranges(used),voidedRanges:ranges(voided),
    fiscalEligible:false,transmittable:false,reportingRulesVerified:false});
}
