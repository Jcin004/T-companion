import {readFile,writeFile} from 'node:fs/promises';
import './build-life-rules.mjs';
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
const root='frontend/vendor/sullyos-world/';
const bubbles=await readFile(root+'thread-bubbles.inc.tsx','utf8');
const state=await readFile(root+'phone-state.inc.tsx','utf8');
const messages=await readFile(root+'phone-messages.inc.tsx','utf8');
let source=`import React,{useState,useEffect,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {CaretRight} from '@phosphor-icons/react';
import {dmThreadsOf,groupThreadOf} from '../frontend/life-rules-vendor.js';
const TokenImg=({value,...props})=><img src={value} {...props}/>;
${bubbles}
function PhoneReader({snapshot,members,onClose}){
 const ownerId=snapshot.owner_id,world={threads:snapshot.threads,npcs:[]};
 const [tab,setTab]=useState('dm');
 ${state}
 const activeDm=dmThreads.find(t=>t.id===dmOpenId),FOLD=50,onEditContent=undefined;
 const [dmExpanded,setDmExpanded]=useState(false),[groupExpanded,setGroupExpanded]=useState(false);
 const scrollRef=useRef(null);
 useEffect(()=>{setDmExpanded(false);},[dmOpenId]);
 useEffect(()=>{const el=scrollRef.current;if(el)el.scrollTop=el.scrollHeight;},[tab,dmOpenId]);
 return <div className="resident-phone-reader"><header><button onClick={onClose}>‹ 返回</button><strong>{snapshot.owner_name}的手机</strong></header>
 <p className="reader-note">观察模式 · 不代发消息，不改变人物已读状态</p><nav><button aria-pressed={tab==='dm'} onClick={()=>setTab('dm')}>私信</button><button aria-pressed={tab==='group'} onClick={()=>setTab('group')}>群聊</button></nav>
 <div ref={scrollRef} className="reader-content">${messages}</div></div>;
}
const roots=new WeakMap();
export function renderPhone(element,props){let root=roots.get(element);if(!root){root=createRoot(element);roots.set(element,root);}root.render(<PhoneReader key={props.snapshot.owner_id} {...props}/>);}
export function unmountPhone(element){const root=roots.get(element);if(root){root.unmount();roots.delete(element);}}
`;
// Adapt only the surrounding view: original DM/group JSX stays traceable;
// editing hooks are removed, and phone-in-phone chrome is not imported.
source=source.replace(/^\s*const latestBeat = episodes[^\n]+\n/gm,'');
source=source.replace(/\s+onPick=\{onEditContent \? m => setEditing\([^\n]+\) : undefined\}/g,'');
source=source.replace(/\{onEditContent && <span[^\n]+<\/span>\}/g,'');
source=source.replace(/text-\[(?:[0-9.]+)px\]/g,'text-[16px]');
source=source.replace(/text-white\/\d+/g,'text-reader-muted').replace(/text-slate-800/g,'text-reader-ink');
await writeFile('artifacts/resident-phone-adapted.tsx',source);
await build({stdin:{contents:source,resolveDir:process.cwd()+'/scripts',loader:'tsx',sourcefile:'resident-phone-adapted.tsx'},bundle:true,format:'esm',platform:'browser',target:'es2019',outfile:'frontend/resident-phone-renderer.js',define:{'process.env.NODE_ENV':'"production"'},legalComments:'inline'});
execFileSync(process.execPath,['node_modules/tailwindcss/lib/cli.js','-i','scripts/resident-phone-tailwind.css','-c','scripts/resident-phone-tailwind.config.cjs','-o','frontend/resident-phone-utilities.css','--minify'],{stdio:'inherit'});
