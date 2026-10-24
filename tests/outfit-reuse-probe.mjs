// Read reviewed, pinned sources into an isolated test only. Nothing is imported
// into the app. Run with --fetch once if the ignored source cache is absent.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {transform} from 'esbuild';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

export async function outfitProbeSource(){
  const catalog=JSON.parse(await readFile('config/outfit-workshop-sources.json','utf8'));
  async function source(repo,path){
    const entry=catalog.sources.find(s=>s.repository.endsWith('/'+repo)),file=entry.files.find(f=>f.path===path);
    const target='data/reference-sources/outfit-review/'+repo+'/'+path;let bytes;
    try{bytes=await readFile(target);}catch(e){
      if(e.code!=='ENOENT'||!process.argv.includes('--fetch'))throw Error('Missing reviewed source cache; run node tests/outfit-reuse-probe.mjs --fetch first');
      const response=await fetch('https://raw.githubusercontent.com/'+entry.repository.split('github.com/')[1]+'/'+entry.commit+'/'+path);
      if(!response.ok)throw Error('Pinned source fetch failed: '+response.status);
      bytes=Buffer.from(await response.arrayBuffer());await mkdir(target.slice(0,target.lastIndexOf('/')),{recursive:true});await writeFile(target,bytes);
    }
    assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);
    assert.equal(createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex'),file.blob);
    return bytes.toString('utf8');
  }
  const pixels=await source('piskel','src/js/utils/PixelUtils.js');
  const frames=await source('Universal-LPC-Spritesheet-Character-Generator','sources/canvas/draw-frames.ts');
  const start=frames.indexOf('export function drawFrameToFrame('),end=frames.indexOf('export function drawFramesToCustomAnimation(');
  assert.ok(start>=0&&end>start);
  const drawing=(await transform(frames.slice(start,end),{loader:'ts',format:'iife',globalName:'LpcProbe',target:'chrome83'})).code;
  // Piskel gets a private namespace and an integer Frame adapter. Only the
  // reviewed connected-fill functions execute; external line algorithms do not.
  return `(function(){const pskl={},$={namespace:()=>pskl};${pixels}\n${drawing}
    function check(value,message){if(!value)throw Error(message);}
    const values=new Uint32Array(64).fill(9);
    for(let y=1;y<7;y++)for(let x=1;x<7;x++)values[y*8+x]=1;
    const frame={getWidth:()=>8,getHeight:()=>8,getPixel(x,y){if(x<0||x>=8||y<0||y>=8)throw Error('bounds');return values[y*8+x];},setPixel(x,y,c){values[y*8+x]=c;}};
    const changed=pskl.PixelUtils.paintSimilarConnectedPixelsFromFrame(frame,2,2,2);
    check(changed.length===36&&values[0]===9&&values[18]===2,'bounded Piskel fill');
    check(pskl.PixelUtils.paintSimilarConnectedPixelsFromFrame(frame,2,2,2)===undefined,'same-color fill');
    pskl.PixelUtils.paintSimilarConnectedPixelsFromFrame(frame,0,0,3);
    check(values[0]===3&&values[63]===3&&values[18]===2,'edge fill isolation');
    const src=document.createElement('canvas');src.width=8;src.height=8;src.getContext('2d').fillStyle='#dc3322';src.getContext('2d').fillRect(0,0,8,8);
    const dest=document.createElement('canvas');dest.width=48;dest.height=48;const ctx=dest.getContext('2d');ctx.imageSmoothingEnabled=false;
    LpcProbe.drawFrameToFrame(ctx,{x:3,y:5},32,src,{x:0,y:0},8);
    check(ctx.getImageData(15,17,1,1).data[0]===220&&ctx.getImageData(3,5,1,1).data[3]===0,'LPC frame centering without stretching');
    return {piskelFill:true,edgeIsolation:true,sameColorNoop:true,lpcCanvasCopy:true,networkRequests:0};})()`;
}

if(import.meta.url===pathToFileURL(process.argv[1]).href){
  const {chromium}=await import('@playwright/test'),browser=await chromium.launch({channel:'msedge',headless:true});
  try{const page=await browser.newPage();await page.route('**/*',route=>route.abort());const result=await page.evaluate(await outfitProbeSource());await writeFile('artifacts/outfit-reuse-browser.json',JSON.stringify(result,null,2));console.log(result);}finally{await browser.close();}
}
