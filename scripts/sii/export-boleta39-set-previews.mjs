// Deterministic offline export of the five official boleta certification previews.
// No RUT, CAF, TED, fiscal folio, signing or network requests.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {buildBoletaSetPreview} from './boleta39-set-xml-preview.mjs';
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/artema-boleta39-set.json',import.meta.url),'utf8'));
export function prepareBoletaSetArtifacts(){
 const outputs=fixtures.cases.map(c=>{
  const result=buildBoletaSetPreview(c);
  if(result.fiscalEligible!==false||result.transmittable!==false||result.schemaValid!==false)
   throw Error('UNSAFE_PREVIEW_STATUS');
  return Object.freeze({caseId:c.id,filename:c.id+'.preview.xml',xml:result.xml,
   sha256:createHash('sha256').update(result.xml).digest('hex')});
 });
 if(outputs.length!==5||new Set(outputs.map(x=>x.caseId)).size!==5)
  throw Error('INCOMPLETE_CERTIFICATION_SET');
 return Object.freeze(outputs);
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const outputDir=process.argv[2];
 if(!outputDir || process.argv.length!==3) throw Error('Usage: node export-boleta39-set-previews.mjs OUTPUT_DIR');
 const artifacts=prepareBoletaSetArtifacts();
 mkdirSync(outputDir,{recursive:true});
 for(const item of artifacts) writeFileSync(join(outputDir,item.filename),item.xml,{flag:'wx',mode:0o600});
 const manifest={description:'NON-FISCAL certification previews, not SII DTE',fiscalEligible:false,
  transmittable:false,items:artifacts.map(({caseId,filename,sha256})=>({caseId,filename,sha256}))};
 writeFileSync(join(outputDir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
}
