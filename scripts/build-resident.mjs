// Bundle our shared domain rules for a non-WebView QuickJS host. Never bundle UI or keys.
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
await mkdir('android/app/src/main/assets/resident',{recursive:true});
await build({entryPoints:['frontend/resident-headless.js'],bundle:true,format:'iife',globalName:'ResidentRules',platform:'neutral',target:'es2019',outfile:'android/app/src/main/assets/resident/rules.js',legalComments:'inline'});
