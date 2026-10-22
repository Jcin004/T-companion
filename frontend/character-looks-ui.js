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
  box.innerHTML=`<header class="looks-heading"><div class="looks-title"><h2>人物形象</h2><button id="looks-close" aria-label="关闭人物形象">× 关闭</button></div>
    <label>正在修改的人物<select id="looks-owner"></select></label>
    <nav class="looks-tabs" aria-label="人物图片"><button id="looks-tab-portrait" aria-pressed="true">对话立绘</button><button id="looks-tab-sprite" aria-pressed="false">像素小人</button></nav></header>
    <div class="looks-scroll">
      <section id="looks-portrait-panel"><h3><span class="looks-person-name"></span>的对话立绘</h3><p>显示在底部对话框的大幅人物图，可上传头像或半身像。只更换这个人物的对话图片。</p>
        <div class="looks-previews"><img id="looks-portrait" alt="当前人物的对话立绘预览"></div>
        <label class="file-button">上传 / 添加这个人物的立绘<input id="looks-portrait-file" type="file" accept="image/png,image/jpeg,image/webp"></label>
        <label>对话时显示哪张图<select id="looks-portrait-choice"></select></label><button id="looks-remove-portrait">删除所选立绘</button><p>最多保存八张。可以在对话中点击人物图片切换。</p>
      </section>
      <section id="looks-sprite-panel" hidden><h3><span class="looks-person-name"></span>的像素小人</h3><p>用于房间里的站立和行走，与对话立绘分别上传。</p>
        <div class="looks-previews"><canvas id="looks-sprite" width="192" height="192" aria-label="当前人物的站立与行走预览"></canvas></div>
        <button id="looks-preview-play" aria-pressed="false">播放行走</button><p id="looks-pose" role="status">站立</p>
        <label>小人面朝哪里（预览）<select id="looks-direction"><option value="down">正面 · 向下</option><option value="left">侧面 · 向左</option><option value="right">侧面 · 向右</option><option value="up">背面 · 向上</option></select></label>
        <label>待上传的图片，每个方向有几张图<input id="looks-frames" type="number" min="1" max="8" value="4"></label>
        <label class="file-button">上传 / 替换这个人物的小人 PNG<input id="looks-sprite-file" type="file" accept="image/png"></label><p id="looks-sprite-name">使用默认小人</p>
        <p>推荐四帧：站立 → 左手右脚 → 站立 → 右手左脚。停止时显示第一帧。整张图分四行，依次放向下、向左、向右、向上的图片，每格正方形，脚底对齐。</p>
        <div class="looks-frame-strip" aria-label="行走帧顺序"></div><p>在绘图软件中修改 PNG 后，从上面的入口重新上传，再保存。</p><button id="looks-reset-sprite">恢复这个人物的默认小人</button>
      </section>
      <details class="looks-default"><summary>这个人物的默认示例形象</summary><label>未上传图片时使用<select id="looks-skin"><option value="0">棕粉开衫</option><option value="1">苔绿毛衣</option><option value="2">蓝灰外套</option></select></label><p>默认示例同时提供配套立绘和小人，已上传的图片优先。</p></details>
    </div><footer class="looks-footer"><button id="looks-save" class="primary">保存这个人物的图片</button><p id="looks-status" role="status"></p></footer>`;
  document.body.append(box);
  let draft,people=[],timer=null,frame=0,resolveClose,owner='',generation=0,playing=false,tab='portrait';
  const safe=fn=>async(...args)=>{try{await fn(...args);}catch(e){report(e);el('looks-status').textContent=e.message;toast(e.message);}};
  function stopPreview(){clearInterval(timer);timer=null;playing=false;frame=0;el('looks-preview-play').textContent='播放行走';el('looks-preview-play').setAttribute('aria-pressed','false');el('looks-pose').textContent='站立';}
  async function spritePreview(){
    const value=draft,token=generation;if(!value)return;
    await previewSprite(el('looks-sprite'),value,el('looks-direction').value,playing?frame:0,()=>token===generation);
    if(token!==generation)return;
    el('looks-pose').textContent=playing?(['站立','左手右脚','站立','右手左脚'][frame%4]+' · 第 '+(frame% (value.sprite?.frames||4)+1)+' 帧'):'站立 · 第 1 帧';
    el('looks-sprite-name').textContent=value.sprite?'已上传这个人物的小人 PNG':'使用这个人物的默认小人';
  }
  async function frameStrip(){
    const token=generation,value=draft,strip=el('world-looks-dialog').querySelector('.looks-frame-strip');strip.replaceChildren();
    for(let i=0;i<(value.sprite?.frames||4);i++){
      const card=node('figure'),c=node('canvas');c.width=96;c.height=96;card.append(c,node('figcaption',(i+1)+' · '+(['站立','左手右脚','站立','右手左脚'][i]||'行走')));strip.append(card);
      await previewSprite(c,value,el('looks-direction').value,i,()=>token===generation);if(token!==generation)return;
    }
  }
  async function preview(){
    const token=generation,value=draft,src=await portraitImage(value,people.find(p=>p.id===owner)?.avatar);if(token!==generation)return;el('looks-portrait').src=src;
    const select=el('looks-portrait-choice');select.replaceChildren();
    if(!draft.portraits.length)select.append(new Option('尚未上传 · 使用这个人物的头像或默认图','0'));
    draft.portraits.forEach((p,i)=>select.append(new Option(p.name,String(i))));select.value=String(draft.portrait);
    el('looks-remove-portrait').disabled=!draft.portraits.length;
    await spritePreview();await frameStrip();
  }
  async function select(){
    const token=++generation;stopPreview();owner=el('looks-owner').value;draft=null;el('looks-save').disabled=true;
    for(const n of box.querySelectorAll('.looks-person-name'))n.textContent=people.find(p=>p.id===owner)?.name||'';
    const result=await api('/character-looks/'+owner);if(token!==generation)return;draft=result;
    el('looks-skin').value=String(draft.skin);el('looks-frames').value=draft.sprite?.frames||4;el('looks-status').textContent='';await preview();el('looks-save').disabled=false;
  }
  function switchTab(value){tab=value;stopPreview();for(const name of ['portrait','sprite']){el('looks-'+name+'-panel').hidden=tab!==name;el('looks-tab-'+name).setAttribute('aria-pressed',String(tab===name));}el('world-looks-dialog').querySelector('.looks-scroll').scrollTop=0;void safe(spritePreview)();}
  el('looks-tab-portrait').onclick=()=>switchTab('portrait');el('looks-tab-sprite').onclick=()=>switchTab('sprite');
  el('looks-direction').onchange=safe(async()=>{stopPreview();await spritePreview();await frameStrip();});
  el('looks-preview-play').onclick=safe(async()=>{
    if(playing){stopPreview();await spritePreview();return;}
    playing=true;frame=0;el('looks-preview-play').textContent='停止 · 回到站立';el('looks-preview-play').setAttribute('aria-pressed','true');await spritePreview();
    timer=setInterval(()=>{frame++;spritePreview().catch(e=>{stopPreview();report(e);toast(e.message);});},120);
  });
  el('looks-owner').onchange=safe(select);
  el('looks-skin').onchange=safe(async()=>{draft.skin=Number(el('looks-skin').value);await preview();});
  el('looks-portrait-choice').onchange=safe(async()=>{draft.portrait=Number(el('looks-portrait-choice').value);await preview();});
  el('looks-portrait-file').onchange=safe(async e=>{if(!e.target.files[0]||!draft)return;if(draft.portraits.length>=8)throw Error('最多八张立绘，请先删除一张');const token=generation,value=draft,file=e.target.files[0],image=await readImage(file);e.target.value='';if(token!==generation||!box.open)return;value.portraits.push({name:file.name.replace(/\.[^.]+$/,'').slice(0,40),image});value.portrait=value.portraits.length-1;await preview();});
  el('looks-remove-portrait').onclick=safe(async()=>{draft.portraits.splice(draft.portrait,1);draft.portrait=0;await preview();});
  el('looks-sprite-file').onchange=safe(async e=>{if(!e.target.files[0]||!draft)return;const frames=Number(el('looks-frames').value),token=generation,value=draft;if(!Number.isInteger(frames)||frames<1||frames>8)throw Error('帧数须为 1–8');const image=await readImage(e.target.files[0],{sprite:true,frames});e.target.value='';if(token!==generation||!box.open)return;stopPreview();value.sprite={image,frames};await preview();});
  el('looks-reset-sprite').onclick=safe(async()=>{draft.sprite=null;await preview();});
  el('looks-save').onclick=safe(async()=>{if(!draft)return;const id=owner,token=generation,value=JSON.parse(JSON.stringify(draft));await api('/character-looks/'+id,'PATCH',value);await refresh({light:true});if(token===generation)el('looks-status').textContent='人物形象已保存';toast((people.find(p=>p.id===id)?.name||'人物')+'的图片已保存');});
  el('looks-close').onclick=()=>box.close();
  box.addEventListener('close',()=>{generation++;stopPreview();resolveClose?.();resolveClose=null;});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&box.open){stopPreview();void safe(spritePreview)();}});
  return {async open(id){
    people=[{id:'user',name:'我'},...await api('/characters')];el('looks-owner').replaceChildren(...people.map(p=>new Option(p.name,p.id)));if(people.some(p=>p.id===id))el('looks-owner').value=id;
    await select();box.showModal();switchTab('portrait');
    return new Promise(resolve=>{resolveClose=resolve;});
  }};
}
