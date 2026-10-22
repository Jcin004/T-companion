import './build-legal.mjs';
import './build-resident.mjs';
import {mkdir, copyFile, readdir, cp, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
await mkdir('dist/assets', {recursive: true});
await copyFile('frontend/index.html', 'dist/index.html');
for (const name of await readdir('frontend')) {
  if (name !== 'index.html') await cp('frontend/' + name, 'dist/assets/' + name, {recursive: true});
}
await writeFile('dist/source-commit.txt',execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()+'\n');
