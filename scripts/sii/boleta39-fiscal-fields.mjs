// Strictly offline fiscal field precheck for synthetic SII type-39 documents.
// Does not reserve folios, read CAF keys, sign, generate TED, or authorize issuance.
const blocked = reason => Object.freeze({ok:false,reason,fiscalEligible:false,transmittable:false});
export function normalizeRut(value) {
  if(typeof value!=='string') return null;
  const cleaned=value.replace(/[.\s]/g,'').toUpperCase();
  const match=/^(\d{1,8})-([0-9K])$/.exec(cleaned);
  if(!match) return null;
  const digits=match[1];
  let sum=0,multiplier=2;
  for(let i=digits.length-1;i>=0;i--){sum+=Number(digits[i])*multiplier;multiplier=multiplier===7?2:multiplier+1;}
  const check=11-(sum%11);
  const dv=check===11?'0':check===10?'K':String(check);
  return dv===match[2] ? `${Number(digits)}-${dv}` : null;
}
export function prepareSyntheticBoleta39FiscalFields({
 issuerRut, folio, cafFrom, cafTo, issueDate, resolutionDate, resolutionNumber
}={}) {
 const rut=normalizeRut(issuerRut);
 if(!rut) return blocked('INVALID_ISSUER_RUT');
 if(![folio,cafFrom,cafTo].every(x=>Number.isSafeInteger(x)&&x>0) ||
    cafFrom>cafTo || folio<cafFrom || folio>cafTo) return blocked('FOLIO_OUT_OF_RANGE');
 const validDate = x => typeof x==='string' && /^\d{4}-\d{2}-\d{2}$/.test(x) &&
    !Number.isNaN(Date.parse(x+'T00:00:00Z')) &&
    new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
 if(!validDate(issueDate)||!validDate(resolutionDate)||resolutionDate>issueDate)
   return blocked('INVALID_FISCAL_DATES');
 if(!Number.isSafeInteger(resolutionNumber)||resolutionNumber<0)
   return blocked('INVALID_RESOLUTION_NUMBER');
 // This is a data-shape precheck only. Never trust caller-supplied CAF ranges or resolution values.
 return Object.freeze({ok:true,issuerRut:rut,folio,issueDate,resolutionDate,resolutionNumber,
  typeDte:39,source:'UNVERIFIED_SYNTHETIC_INPUT',cafVerified:false,
  authorizationVerified:false,fiscalEligible:false,transmittable:false});
}
