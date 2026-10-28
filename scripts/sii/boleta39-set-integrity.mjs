// Immutable offline reference for SII boleta SET fixtures.
// Guard against silent mutations of the official case quantities, names and prices.
// This is NOT SII approval and MUST NOT enable fiscal issuance.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const canonical = x => JSON.stringify(x);
const fixture=JSON.parse(readFileSync(new URL('./fixtures/artema-boleta39-set.json',import.meta.url),'utf8'));
const trusted=fixture.cases.map(c=>Object.freeze({
 id:c.id,hash:createHash('sha256').update(canonical(c)).digest('hex')
}));
export function verifyOfficialBoletaCase(candidate){
 if(!candidate || typeof candidate!=='object') return Object.freeze({ok:false,reason:'INVALID_CASE',fiscalEligible:false});
 const expected=trusted.find(x=>x.id===candidate.id);
 if(!expected) return Object.freeze({ok:false,reason:'UNKNOWN_CASE',fiscalEligible:false});
 const hash=createHash('sha256').update(canonical(candidate)).digest('hex');
 return Object.freeze({ok:hash===expected.hash,reason:hash===expected.hash?null:'ALTERED_CASE',
  fiscalEligible:false,transmittable:false});
}
export const officialBoletaCaseDigests=Object.freeze(trusted);
