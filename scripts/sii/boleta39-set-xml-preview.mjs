// Offline XML preview for SII's five boleta certification cases.
// Intentionally NOT a DTE: no folio, RUT, CAF, TED, signature or SII envelope.
// This preview checks field mapping only; never transmit or treat as tax evidence.
import {inspectBoletaSetCase} from './boleta39-set-arithmetic.mjs';
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const safe=s=>typeof s==='string' && s.length>0 && ![...s].some(c=>{
 const n=c.codePointAt(0);
 return n<32 && ![9,10,13].includes(n) || n>=0xD800&&n<=0xDFFF || n===0xFFFE || n===0xFFFF;
});
export function buildBoletaSetPreview(c){
 if(!c || !/^CASO-[1-5]$/.test(c.id)||!Array.isArray(c.items)||
    c.items.some(x=>!safe(x.name)||x.name.length>80||
      x.unit!==undefined && (!safe(x.unit)||x.unit.length>10)))
   throw Error('INVALID_CERTIFICATION_CASE');
 const totals=inspectBoletaSetCase(c);
 if(!totals.matchesFixture) throw Error('CERTIFICATION_TOTAL_MISMATCH');
 const details=totals.lines.map(x=>`    <Detalle><NroLinDet>${x.index}</NroLinDet><NmbItem>${esc(x.name)}</NmbItem><QtyItem>${x.quantity}</QtyItem><PrcItem>${x.unitPriceWithIva}</PrcItem>${x.unit?`<UnmdItem>${esc(x.unit)}</UnmdItem>`:''}${x.tax==='exento'?'<IndExe>1</IndExe>':''}<MontoItem>${x.gross}</MontoItem></Detalle>`).join('\n');
 const xml=`<?xml version="1.0" encoding="UTF-8"?>\n<WalinkaCertificationPreview xmlns="urn:walinka:sii:non-fiscal-preview" fiscalEligible="false">\n  <TipoDTE>39</TipoDTE>\n  <Referencia><CodRef>SET</CodRef><RazonRef>${c.id}</RazonRef></Referencia>\n  <Totales><AfectoBruto>${totals.affectedGross}</AfectoBruto><Exento>${totals.exemptGross}</Exento><Total>${totals.gross}</Total></Totales>\n${details}\n</WalinkaCertificationPreview>\n`;
 return Object.freeze({xml,caseId:c.id,documentType:39,certificationPreview:true,
   fiscalEligible:false,siiValidated:false,schemaValid:false,signed:false,transmittable:false});
}
