import './build-legal.mjs';
import './build-resident.mjs';
import './build-pixel-tools.mjs';
import {mkdir, copyFile, readdir, cp, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
await mkdir('dist/assets', {recursive: true});
await copyFile('frontend/index.html', 'dist/index.html');
for (const name of await readdir('frontend')) {
  if (name !== 'index.html') await cp('frontend/' + name, 'dist/assets/' + name, {recursive: true});
}
let sourceCommit=process.env.T_SOURCE_COMMIT||'unversioned';
try { sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim(); } catch {}
if(sourceCommit!=='unversioned'&&!/^[a-f0-9]{40}$/.test(sourceCommit))throw Error('Invalid build source commit');
await writeFile('dist/source-commit.txt',sourceCommit+'\n');
