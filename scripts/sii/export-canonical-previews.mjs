// Export five deterministic non-fiscal previews using synthetic issuer data only.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {serializeBoleta39CanonicalPreview} from './boleta39-canonical-xml-preview.mjs';
const output=process.argv[2];
if(!output)throw Error('OUTPUT_DIRECTORY_REQUIRED');
const cases=JSON.parse(readFileSync(new URL('./fixtures/artema-boleta39-set.json',import.meta.url),'utf8')).cases;
const issuer={rut:'76086428-5',legalName:'Empresa de prueba',businessActivity:'Comercio',address:'Calle 123',commune:'Santiago',resolutionDate:'2024-01-01',resolutionNumber:80};
const operation={documentType:39,folio:12,issuedOn:'2026-10-28'};
mkdirSync(resolve(output),{recursive:true});
for(const c of cases){
 const result=serializeBoleta39CanonicalPreview({issuer,operation,certificationCase:c});
 if(!result.ok||result.transmittable)throw Error('UNSAFE_PREVIEW');
 writeFileSync(resolve(output,c.id+'.canonical.xml'),result.xml,'utf8');
}
