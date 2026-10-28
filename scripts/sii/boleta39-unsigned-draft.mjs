// Offline unsigned XML structure draft for boleta 39. NOT a fiscal DTE.
// Never send, print as tax document, sign, or reserve a CAF folio from this draft.
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const fail = reason => Object.freeze({ok:false,reason,fiscalEligible:false});
export function buildUnsignedBoleta39Draft({prepared,issueDate='2026-10-28'}={}) {
 if (prepared?.ok !== true || prepared.fiscalEligible !== false ||
     !prepared.snapshot || !Array.isArray(prepared.snapshot.lines) ||
     prepared.snapshot.lines.length === 0 || prepared.snapshot.lines.length > 1000)
   return fail('SNAPSHOT_NOT_PREPARED');
 const s=prepared.snapshot;
 if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate) ||
     typeof s.saleId!=='string' || !s.saleId.trim() ||
     !Number.isSafeInteger(s.total) || s.total<=0 ||
     s.lines.some(x=>typeof x.name!=='string' || !x.name.trim() ||
       x.name.length>80 || !Number.isSafeInteger(x.subtotal) ||
       x.subtotal<0 || x.taxCategory!=='IVA_AFECTO_19'))
   return fail('UNSUPPORTED_DOCUMENT');
 const sum=s.lines.reduce((v,x)=>v+BigInt(x.subtotal),0n);
 if(sum!==BigInt(s.total)) return fail('TOTAL_MISMATCH');
 // Deliberately omit folio, real RUT, CAF/TED, XMLDSig, tax breakdown and SII submission envelope.
 // Not schema-valid by design; a reviewable structural skeleton only.
 const lines=s.lines.map((x,i)=>`    <Detalle><NroLinDet>${i+1}</NroLinDet><NmbItem>${esc(x.name)}</NmbItem><MontoItem>${x.subtotal}</MontoItem></Detalle>`).join('\n');
 const xml=`<?xml version="1.0" encoding="UTF-8"?>\n<DTE xmlns="http://www.sii.cl/SiiDte" version="1.0">\n  <Documento ID="BORRADOR_NO_FISCAL">\n    <Encabezado><IdDoc><TipoDTE>39</TipoDTE><FchEmis>${issueDate}</FchEmis></IdDoc><Totales><MntTotal>${s.total}</MntTotal></Totales></Encabezado>\n${lines}\n  </Documento>\n</DTE>\n`;
 return Object.freeze({ok:true,fiscalEligible:false,siiValidated:false,
   schemaValid:false,signed:false,transmittable:false,xml});
}
