// Pure, non-transmittable DTE 39 document-shape candidate.
// Deliberately no folio, issuer identity, CAF, TED, signature, or envelope.
// Not a valid SII DTE until completed and validated against official schema.
// IndServicio=3 and consumer RUT are grounded in SII Boleta Format v3.0, pp.8-10.
// https://www.sii.cl/factura_electronica/factura_mercado/formato_boletas_elec_20221228_v3.pdf
import {inspectBoletaSetCase} from './boleta39-set-arithmetic.mjs';
import {verifyOfficialBoletaCase} from './boleta39-set-integrity.mjs';
const escapeXml=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
export function buildBoleta39DocumentCandidate(c){
 if(!verifyOfficialBoletaCase(c).ok) throw Error('UNTRUSTED_CERTIFICATION_CASE');
 const totals=inspectBoletaSetCase(c);
 if(!totals.matchesFixture) throw Error('TOTAL_MISMATCH');
 const detail=totals.lines.map(x=>`    <Detalle><NroLinDet>${x.index}</NroLinDet>${x.tax==='exento'?'<IndExe>1</IndExe>':''}<NmbItem>${escapeXml(x.name)}</NmbItem><QtyItem>${x.quantity}</QtyItem>${x.unit?`<UnmdItem>${escapeXml(x.unit)}</UnmdItem>`:''}<PrcItem>${x.unitPriceWithIva}</PrcItem><MontoItem>${x.gross}</MontoItem></Detalle>`).join('\n');
 const xml=`<?xml version="1.0" encoding="UTF-8"?>\n<DTE xmlns="http://www.sii.cl/SiiDte" version="1.0">\n  <Documento ID="BORRADOR_NO_FISCAL">\n    <Encabezado><IdDoc><TipoDTE>39</TipoDTE><IndServicio>3</IndServicio></IdDoc><Receptor><RUTRecep>66666666-6</RUTRecep></Receptor><Totales>${totals.exemptGross?`<MntExe>${totals.exemptGross}</MntExe>`:""}<MntTotal>${totals.gross}</MntTotal></Totales></Encabezado>\n${detail}\n    <Referencia><NroLinRef>1</NroLinRef><CodRef>SET</CodRef><RazonRef>${c.id}</RazonRef></Referencia>\n  </Documento>\n</DTE>\n`;
 return Object.freeze({xml,caseId:c.id,documentType:39,documentShapeCandidate:true,
  fiscalEligible:false,siiValidated:false,schemaValid:false,signed:false,transmittable:false});
}
