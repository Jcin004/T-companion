// Debug experiment only. Not included by the production build-web entrypoint.
import {build} from 'esbuild';
import {mkdir,copyFile} from 'node:fs/promises';
const target='android/app/src/debug/assets/world-probe';
await mkdir(target,{recursive:true});
await build({entryPoints:['frontend/world-probe-core.js'],bundle:true,format:'iife',globalName:'WorldProbe',platform:'neutral',target:'es2019',outfile:target+'/rules.js',legalComments:'inline'});
await copyFile('frontend/world-probe.html',target+'/index.html');
