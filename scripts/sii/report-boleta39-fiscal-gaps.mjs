// Offline report: missing fiscal fields in the five non-transmittable candidates.
// Presence is only a syntactic check, never proof of SII compliance.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {buildBoleta39DocumentCandidate} from './boleta39-document-candidate.mjs';
const cases=JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/artema-boleta39-set.json',import.meta.url)),'utf8')).cases;
if(!Array.isArray(cases)||cases.length!==5) throw Error('EXPECTED_FIVE_CASES');
const markers={folio:'<Folio>',fecha_emision:'<FchEmis>',emisor:'<Emisor>',timbre:'<TED>',firma:'<Signature',fecha_firma:'<TmstFirma>'};
export function inspectFiscalGaps(xml){
 const missing=Object.entries(markers).filter(([,marker])=>!xml.includes(marker)).map(([key])=>key);
 return {missing,completeByPresence:missing.length===0};
}
const report=cases.map(c=>{
 const candidate=buildBoleta39DocumentCandidate(c);
 const gaps=inspectFiscalGaps(candidate.xml);
 if(candidate.transmittable||candidate.fiscalEligible||gaps.completeByPresence) throw Error('UNEXPECTED_FISCAL_READINESS');
 return {caseId:c.id,missing:gaps.missing,transmittable:false};
});
process.stdout.write(JSON.stringify({kind:'NON_FISCAL_GAP_REPORT',report},null,2)+'\n');
