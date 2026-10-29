// Diagnostic header serialization only. NEVER embed this in a live DTE.
// Uses the already validated header model; no real issuer, CAF or signing.
import {buildBoleta39HeaderModel} from './boleta39-header-model.mjs';
const xmlEscape=(s)=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
export function buildBoleta39HeaderPreview(input){
 const model=buildBoleta39HeaderModel(input);
 if(!model.ok)return Object.freeze({ok:false,reason:model.reason,transmittable:false});
 const h=model.header,i=h.issuer;
 const xml=`<WalinkaNonFiscalHeaderPreview>
  <IdDoc><TipoDTE>39</TipoDTE><Folio>${h.folio}</Folio><FchEmis>${h.issuedOn}</FchEmis></IdDoc>
  <Emisor><RUTEmisor>${xmlEscape(i.rut)}</RUTEmisor><RznSocEmisor>${xmlEscape(i.legalName)}</RznSocEmisor><GiroEmisor>${xmlEscape(i.businessActivity)}</GiroEmisor><DirOrigen>${xmlEscape(i.address)}</DirOrigen><CmnaOrigen>${xmlEscape(i.commune)}</CmnaOrigen></Emisor>
  <ResolutionMetadata><FchResol>${i.resolutionDate}</FchResol><NroResol>${i.resolutionNumber}</NroResol></ResolutionMetadata>
</WalinkaNonFiscalHeaderPreview>`;
 return Object.freeze({ok:true,xml,documentType:39,fiscalEligible:false,
  schemaValid:false,signed:false,transmittable:false});
}
