import './build-legal.mjs';
import {mkdir, copyFile, readdir, cp} from 'node:fs/promises';
await mkdir('dist/assets', {recursive: true});
await copyFile('frontend/index.html', 'dist/index.html');
for (const name of await readdir('frontend')) {
  if (name !== 'index.html') await cp('frontend/' + name, 'dist/assets/' + name, {recursive: true});
}
