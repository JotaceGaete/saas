// Offline data model for a future DTE 39 header. No XML, CAF, keys, or transmission.
// Required fields are candidate mappings, not a claim of official XSD compliance.
const fail=(reason)=>Object.freeze({ok:false,reason,fiscalEligible:false,transmittable:false});
const text=(v,max)=>typeof v==='string'&&v.trim().length>0&&v===v.trim()&&v.length<=max&& !/[<>\u0000-\u001f]/.test(v);
const rut=(v)=>typeof v==='string'&&/^\d{1,8}-[0-9K]$/.test(v)&&(()=>{
 const [digits,check]=v.split('-');let sum=0,mult=2;
 for(let i=digits.length-1;i>=0;i--){sum+=Number(digits[i])*mult;mult=mult===7?2:mult+1;}
 const remainder=11-(sum%11);return (remainder===11?'0':remainder===10?'K':String(remainder))===check;
})();
const date=(v)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
export function buildBoleta39HeaderModel({issuer,operation}={}){
 if(!issuer||typeof issuer!=='object'||Array.isArray(issuer))return fail('ISSUER_REQUIRED');
 if(!operation||typeof operation!=='object'||Array.isArray(operation))return fail('OPERATION_REQUIRED');
 if(!rut(issuer.rut))return fail('INVALID_ISSUER_RUT');
 if(!text(issuer.legalName,100))return fail('INVALID_ISSUER_NAME');
 if(!text(issuer.businessActivity,80))return fail('INVALID_ISSUER_ACTIVITY');
 if(!text(issuer.address,70))return fail('INVALID_ISSUER_ADDRESS');
 if(!text(issuer.commune,20))return fail('INVALID_ISSUER_COMMUNE');
 if(!date(issuer.resolutionDate))return fail('INVALID_RESOLUTION_DATE');
 if(!Number.isSafeInteger(issuer.resolutionNumber)||issuer.resolutionNumber<0)return fail('INVALID_RESOLUTION_NUMBER');
 if(!Number.isSafeInteger(operation.folio)||operation.folio<=0)return fail('INVALID_FOLIO');
 if(!date(operation.issuedOn))return fail('INVALID_ISSUE_DATE');
 if(operation.documentType!==39)return fail('DOCUMENT_TYPE_NOT_39');
 return Object.freeze({ok:true,header:Object.freeze({
  documentType:39,folio:operation.folio,issuedOn:operation.issuedOn,
  issuer:Object.freeze({rut:issuer.rut,legalName:issuer.legalName,businessActivity:issuer.businessActivity,
   address:issuer.address,commune:issuer.commune,resolutionDate:issuer.resolutionDate,
   resolutionNumber:issuer.resolutionNumber})
 }),fiscalEligible:false,transmittable:false,requiresCaf:true,requiresSignature:true,
 requiresOfficialSchemaValidation:true});
}
