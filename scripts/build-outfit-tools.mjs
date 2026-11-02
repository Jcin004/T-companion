// SPDX-License-Identifier: AGPL-3.0-only
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {transform} from 'esbuild';
const root=new URL('../frontend/',import.meta.url),source=await readFile(new URL('vendor/lpc/frame-copy.inc.ts',root),'utf8');
const meta=JSON.parse(await readFile(new URL('vendor/lpc/PROVENANCE.json',root),'utf8'));
if(createHash('sha256').update(source).digest('hex')!==meta.excerpt_sha256)throw Error('LPC frame copy checksum mismatch');
const compiled=await transform(source,{loader:'ts',format:'esm',target:'chrome83'});
await writeFile(new URL('lpc-frame-copy.js',root),'// Generated; GPL-3.0. See vendor/lpc/LICENSE and PROVENANCE.json.\n'+compiled.code);
