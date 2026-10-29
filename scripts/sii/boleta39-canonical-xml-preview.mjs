// Single-source diagnostic XML serializer for the canonical boleta 39 draft.
// This root is deliberately NOT an SII DTE. No fiscal signature, CAF, or transmission.
import {buildBoleta39CanonicalDraft} from './boleta39-canonical-draft.mjs';
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
export function serializeBoleta39CanonicalPreview(input){
 const result=buildBoleta39CanonicalDraft(input);
 if(!result.ok)return Object.freeze({ok:false,reason:result.reason,transmittable:false});
 const d=result.draft,i=d.header.issuer;
 const lines=d.lines.map(x=>`    <Detalle><NroLinDet>${x.index}</NroLinDet>${x.tax==='exento'?'<IndExe>1</IndExe>':''}<NmbItem>${esc(x.name)}</NmbItem><QtyItem>${x.quantity}</QtyItem>${x.unit?`<UnmdItem>${esc(x.unit)}</UnmdItem>`:''}<PrcItem>${x.unitPriceWithIva}</PrcItem><MontoItem>${x.gross}</MontoItem></Detalle>`).join('\n');
 const xml=`<?xml version="1.0" encoding="UTF-8"?>
<WalinkaNonFiscalCanonicalPreview>
  <Encabezado>
    <IdDoc><TipoDTE>39</TipoDTE><Folio>${d.header.folio}</Folio><FchEmis>${d.header.issuedOn}</FchEmis></IdDoc>
    <Emisor><RUTEmisor>${esc(i.rut)}</RUTEmisor><RznSocEmisor>${esc(i.legalName)}</RznSocEmisor><GiroEmisor>${esc(i.businessActivity)}</GiroEmisor><DirOrigen>${esc(i.address)}</DirOrigen><CmnaOrigen>${esc(i.commune)}</CmnaOrigen></Emisor>
    <Receptor><RUTRecep>${d.receptor.rut}</RUTRecep></Receptor>
    <Totales>${d.totals.exemptGross?`<MntExe>${d.totals.exemptGross}</MntExe>`:''}<MntTotal>${d.totals.gross}</MntTotal></Totales>
  </Encabezado>
${lines}
  <Referencia><NroLinRef>1</NroLinRef><CodRef>SET</CodRef><RazonRef>${esc(d.reference.reason)}</RazonRef></Referencia>
</WalinkaNonFiscalCanonicalPreview>
`;
 return Object.freeze({ok:true,xml,caseId:d.caseId,fiscalEligible:false,
  schemaValid:false,siiValidated:false,signed:false,transmittable:false});
}
