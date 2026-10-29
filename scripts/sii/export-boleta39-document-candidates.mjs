// CI-only offline fixture exporter: no real issuer, CAF, folio, or certificate.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildBoleta39DocumentCandidate} from './boleta39-document-candidate.mjs';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/artema-boleta39-set.json',import.meta.url),'utf8'));
export function candidateFiles(){
 return fixture.cases.map(c=>{
  const result=buildBoleta39DocumentCandidate(c);
  if(result.transmittable!==false||result.schemaValid!==false||result.fiscalEligible!==false)
   throw Error('UNSAFE_DOCUMENT_CANDIDATE');
  return {name:c.id+'.candidate.xml',xml:result.xml};
 });
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3) throw Error('Usage: node export-boleta39-document-candidates.mjs OUTPUT_DIR');
 mkdirSync(process.argv[2],{recursive:true});
 for(const item of candidateFiles()) writeFileSync(join(process.argv[2],item.name),item.xml,{flag:'wx',mode:0o600});
}
