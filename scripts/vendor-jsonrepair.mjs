// Copy the pinned browser modules verbatim; no CDN or runtime installation required.
import {readFile,mkdir,copyFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base='node_modules/jsonrepair',target='frontend/vendor/jsonrepair';
const pkg=JSON.parse(await readFile(base+'/package.json','utf8'));
if(pkg.version!=='3.15.0'||pkg.license!=='ISC')throw Error('Review the new jsonrepair version/license before vendoring');
const files=['regular/jsonrepair.js','utils/stringUtils.js','utils/JSONRepairError.js'],hashes={};
for(const file of files){await mkdir(target+'/'+file.slice(0,file.lastIndexOf('/')),{recursive:true});await copyFile(base+'/lib/esm/'+file,target+'/'+file);hashes[file]=createHash('sha256').update(await readFile(target+'/'+file)).digest('hex');}
await copyFile(base+'/LICENSE.md',target+'/LICENSE.md');
await writeFile(target+'/provenance.json',JSON.stringify({name:'jsonrepair',version:pkg.version,license:pkg.license,repository:pkg.repository.url,modifications:'none',sha256:hashes},null,2)+'\n');
