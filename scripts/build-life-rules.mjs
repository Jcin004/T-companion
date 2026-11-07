import {build} from 'esbuild';
await build({entryPoints:['scripts/life-rules-vendor.ts'],bundle:true,format:'esm',platform:'neutral',target:'es2019',outfile:'frontend/life-rules-vendor.js',legalComments:'inline'});
