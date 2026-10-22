// SPDX-License-Identifier: AGPL-3.0-only
import {portraitImage,previewSprite} from './world-art.js';
const el=id=>document.getElementById(id),node=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
async function readImage(file,{sprite=false,frames=4}={}){
  if(!file||!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>4000000)throw Error('请选择不超过 4 MB 的 PNG、JPEG 或 WebP 图片');
  const src=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('图片读取失败'));r.readAsDataURL(file);});
  const image=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('图片无法解码'));i.src=src;});
  if(image.width*image.height>16000000)throw Error('图片尺寸过大，请缩小到 1600 万像素以内');
  if(sprite){if(image.width%frames||image.height%4||image.width/frames!==image.height/4)throw Error('行走图集须为四行，依次下、左、右、上，每帧为正方形');if(image.width>2048||image.height>2048||file.type!=='image/png'||src.length>1200000)throw Error('行走图集请使用不超过 2048 像素、900 KB 的透明 PNG');return src;}
  const canvas=document.createElement('canvas'),scale=Math.min(1,768/Math.max(image.width,image.height));canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/png');
}
export function mountCharacterLooksUI({api,getWorld,refresh,toast,report}){
  const box=node('dialog');box.id='world-looks-dialog';box.className='world-panel';
  box.innerHTML='<header><h2>人物 · 形象</h2><button id="looks-close" aria-label="关闭人物形象">×</button></header><label>人物<select id="looks-owner"></select></label><p>形象绑定现有人物，身份设定仍在人设名册中编辑。</p><div class="looks-previews"><img id="looks-portrait" alt="对话立绘预览"><canvas id="looks-sprite" width="192" height="192" aria-label="四方向行走预览"></canvas></div><label>默认示例形象<select id="looks-skin"><option value="0">棕粉开衫</option><option value="1">苔绿毛衣</option><option value="2">蓝灰外套</option></select></label><label>对话立绘<select id="looks-portrait-choice"></select></label><label class="file-button">添加立绘（最多八张）<input id="looks-portrait-file" type="file" accept="image/png,image/jpeg,image/webp"></label><button id="looks-remove-portrait">删除所选立绘</button><hr><label>每个方向的帧数<input id="looks-frames" type="number" min="1" max="8" value="4"></label><label class="file-button">导入四方向行走 PNG<input id="looks-sprite-file" type="file" accept="image/png"></label><p>图集四行依次为下、左、右、上；每帧为正方形，脚底对齐。请先预览四个方向。</p><label>预览方向<select id="looks-direction"><option value="down">向下</option><option value="left">向左</option><option value="right">向右</option><option value="up">向上</option></select></label><button id="looks-reset-sprite">恢复默认小人</button><button id="looks-save" class="primary">保存人物形象</button><p id="looks-status" role="status"></p>';
  document.body.append(box);
  let draft,people=[],timer=null,frame=0,resolveClose;
  const safe=fn=>async(...args)=>{try{await fn(...args);}catch(e){report(e);el('looks-status').textContent=e.message;toast(e.message);}};
  async function preview(){
    el('looks-portrait').src=await portraitImage(draft,people.find(p=>p.id===el('looks-owner').value)?.avatar);
    const select=el('looks-portrait-choice');select.replaceChildren();
    if(!draft.portraits.length)select.append(new Option('跟随头像 / 默认立绘','0'));
    draft.portraits.forEach((p,i)=>select.append(new Option(p.name,String(i))));select.value=String(draft.portrait);
    el('looks-remove-portrait').disabled=!draft.portraits.length;
    await previewSprite(el('looks-sprite'),draft,el('looks-direction').value,frame++);
  }
  async function select(){draft=await api('/character-looks/'+el('looks-owner').value);el('looks-skin').value=String(draft.skin);el('looks-frames').value=draft.sprite?.frames||4;el('looks-status').textContent='';await preview();}
  el('looks-owner').onchange=safe(select);
  el('looks-skin').onchange=safe(async()=>{draft.skin=Number(el('looks-skin').value);await preview();});
  el('looks-portrait-choice').onchange=safe(async()=>{draft.portrait=Number(el('looks-portrait-choice').value);await preview();});
  el('looks-portrait-file').onchange=safe(async e=>{if(!e.target.files[0])return;if(draft.portraits.length>=8)throw Error('最多八张立绘，请先删除一张');const file=e.target.files[0];draft.portraits.push({name:file.name.replace(/\.[^.]+$/,'').slice(0,40),image:await readImage(file)});draft.portrait=draft.portraits.length-1;e.target.value='';await preview();});
  el('looks-remove-portrait').onclick=safe(async()=>{draft.portraits.splice(draft.portrait,1);draft.portrait=0;await preview();});
  el('looks-sprite-file').onchange=safe(async e=>{if(!e.target.files[0])return;const frames=Number(el('looks-frames').value);if(!Number.isInteger(frames)||frames<1||frames>8)throw Error('帧数须为 1–8');draft.sprite={image:await readImage(e.target.files[0],{sprite:true,frames}),frames};e.target.value='';await preview();});
  el('looks-reset-sprite').onclick=safe(async()=>{draft.sprite=null;await preview();});
  el('looks-save').onclick=safe(async()=>{await api('/character-looks/'+el('looks-owner').value,'PATCH',draft);await refresh({light:true});el('looks-status').textContent='人物形象已保存';toast('人物形象已保存');});
  el('looks-close').onclick=()=>box.close();
  box.addEventListener('close',()=>{clearInterval(timer);timer=null;resolveClose?.();resolveClose=null;});
  return {async open(id){
    people=[{id:'user',name:'我'},...await api('/characters')];el('looks-owner').replaceChildren(...people.map(p=>new Option(p.name,p.id)));if(people.some(p=>p.id===id))el('looks-owner').value=id;
    await select();box.showModal();timer=setInterval(()=>{if(draft)previewSprite(el('looks-sprite'),draft,el('looks-direction').value,frame++).catch(e=>{clearInterval(timer);report(e);});},160);
    return new Promise(resolve=>{resolveClose=resolve;});
  }};
}
