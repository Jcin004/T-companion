// SPDX-License-Identifier: AGPL-3.0-only
import {portraitImage,previewSprite} from './world-art.js';
import {skinChoices,atlasMeta,validateAtlas,DIRECTIONS,ACTIONS,EXPRESSIONS} from './character-looks.js';
const el=id=>document.getElementById(id),node=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
async function readImage(file,{sprite=false,frames=4,row_count=4}={}){
  if(!file||!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>4000000)throw Error('请选择不超过 4 MB 的 PNG、JPEG 或 WebP 图片');
  const src=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('图片读取失败'));r.readAsDataURL(file);});
  const image=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('图片无法解码'));i.src=src;});
  if(image.width*image.height>16000000)throw Error('图片尺寸过大，请缩小到 1600 万像素以内');
  if(sprite){if(image.width%frames||image.height%row_count)throw Error('图片宽高须能按填写的列数和行数均匀分格');if(image.width>2048||image.height>2048||file.type!=='image/png'||src.length>1200000)throw Error('图集请使用不超过 2048 像素、900 KB 的透明 PNG');return src;}
  const canvas=document.createElement('canvas'),scale=Math.min(1,768/Math.max(image.width,image.height));canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/png');
}
export function mountCharacterLooksUI({api,getWorld,refresh,toast,report}){
  const box=node('dialog');box.id='world-looks-dialog';box.className='world-panel';
  box.innerHTML=`<header class="looks-heading"><div class="looks-title"><h2>人物形象</h2><button id="looks-close" aria-label="关闭人物形象">× 关闭</button></div>
    <label>正在修改的人物<select id="looks-owner"></select></label>
    <label>正在编辑的皮肤<select id="looks-skin-choice"></select></label>
    <nav class="looks-tabs" aria-label="人物图片"><button id="looks-tab-portrait" aria-pressed="true">表情立绘</button><button id="looks-tab-sprite" aria-pressed="false">站立 / 行走</button><button id="looks-tab-action" aria-pressed="false">交互动作</button></nav></header>
    <div class="looks-scroll">
      <details class="looks-skin-management"><summary>皮肤管理与 AI 选择</summary><p id="looks-active-skin-name"></p><label>皮肤名称<input id="looks-skin-name" maxlength="40" placeholder="例如：日常服、睡衣"></label><button id="looks-add-skin">添加一套皮肤</button><button id="looks-rename-skin">修改皮肤名称</button><button id="looks-delete-skin">删除这套皮肤</button><button id="looks-use-skin">设为当前皮肤</button><label class="looks-checkbox"><input id="looks-ai-auto" type="checkbox">允许这个人物自主换装</label><label class="looks-checkbox"><input id="looks-ai-allowed" type="checkbox">这套皮肤允许 AI 选择</label><p>AI 只会从允许的皮肤中选择。添加或编辑后按底部保存。</p></details>
      <section id="looks-portrait-panel"><h3><span class="looks-person-name"></span>的对话立绘</h3><p>显示在底部对话框的大幅人物图，可上传头像或半身像。只更换这个人物的对话图片。</p>
        <div class="looks-previews"><img id="looks-portrait" alt="当前人物的对话立绘预览"></div>
        <label class="file-button">上传 / 添加这个人物的立绘<input id="looks-portrait-file" type="file" accept="image/png,image/jpeg,image/webp"></label>
        <label>对话时显示哪张图<select id="looks-portrait-choice"></select></label><label>这张图对应的表情<select id="looks-emotion"><option value="">未分类 · 手动切换</option></select></label><button id="looks-remove-portrait">删除所选立绘</button><p>每套皮肤最多八张。AI 在台词里选择表情时切换对应图；缺少该表情则使用平静或默认立绘。表情图片不改变语音音色。</p>
      </section>
      <section id="looks-sprite-panel" hidden><h3><span class="looks-person-name"></span>的像素小人</h3><p>用于房间里的站立、行走和已完成的交互，与对话立绘分别上传。</p>
        <label id="looks-action-label" hidden>房间交互分类<select id="looks-action"></select></label>
        <div class="looks-previews"><canvas id="looks-sprite" width="192" height="192" aria-label="当前人物的站立与行走预览"></canvas></div>
        <button id="looks-preview-play" aria-pressed="false">播放行走</button><p id="looks-pose" role="status">站立</p>
        <label>小人面朝哪里（预览）<select id="looks-direction"><option value="down">正面 · 向下</option><option value="left">侧面 · 向左</option><option value="right">侧面 · 向右</option><option value="up">背面 · 向上</option></select></label>
        <label>图集模板<select id="looks-atlas-preset"><option value="legacy">四帧 · 下 / 左 / 右 / 上</option><option value="rpg">四帧 · 下 / 右 / 上 / 左</option><option value="three">三帧 · 中间站立</option><option value="action">单行交互动作</option></select></label>
        <label>每行有几帧（列数）<input id="looks-frames" type="number" min="1" max="8" value="4"></label><label>整张图共几行<input id="looks-row-count" type="number" min="1" max="16" value="4"></label>
        <div id="looks-direction-rows"></div><label>站立用第几帧<input id="looks-idle-frame" type="number" min="1" max="8" value="1"></label><label>行走播放顺序（帧号用逗号分开）<input id="looks-walk-order" value="1,2,3,4"></label><button id="looks-apply-atlas">应用方向与帧设置</button>
        <label class="file-button">上传 / 替换这个人物的小人 PNG<input id="looks-sprite-file" type="file" accept="image/png"></label><p id="looks-sprite-name">使用默认小人</p>
        <p>方向按小人脸朝屏幕的方向填写，每行、每格从 1 开始编号。三帧可选第 2 帧站立，播放 2,1,2,3；四帧可按站立、左手右脚、站立、右手左脚排列。支持长方形格子，请保持脚底对齐。</p>
        <div class="looks-frame-strip" aria-label="行走帧顺序"></div><p>在绘图软件中修改 PNG 后，从上面的入口重新上传，再保存。</p><button id="looks-reset-sprite">恢复这个人物的默认小人</button>
      </section>
      <details class="looks-default"><summary>这个人物的默认示例形象</summary><label>未上传图片时使用<select id="looks-skin"><option value="0">棕粉开衫</option><option value="1">苔绿毛衣</option><option value="2">蓝灰外套</option></select></label><p>默认示例同时提供配套立绘和小人，已上传的图片优先。</p></details>
    </div><footer class="looks-footer"><button id="looks-save" class="primary">保存这个人物的图片</button><p id="looks-status" role="status"></p></footer>`;
  document.body.append(box);
  let draft,catalog,editingSkin='default',people=[],timer=null,frame=0,resolveClose,owner='',generation=0,playing=false,tab='portrait';
  const safe=fn=>async(...args)=>{try{await fn(...args);}catch(e){report(e);el('looks-status').textContent=e.message;toast(e.message);}};
  for(const [id,label] of Object.entries(EXPRESSIONS))el('looks-emotion').append(new Option(label,id));
  for(const [id,label] of Object.entries(ACTIONS))el('looks-action').append(new Option(label,id));
  for(const [i,d] of DIRECTIONS.entries()){const label=node('label',(['向下（正面）','向左','向右','向上（背面）'][i])+'用第几行'),input=node('input');input.id='looks-row-'+d;input.type='number';input.min=1;input.max=16;label.append(input);el('looks-direction-rows').append(label);}
  function currentAtlas(){return tab==='action'?draft.actions?.[el('looks-action').value]:draft.sprite;}
  function putAtlas(value){if(tab==='action'){draft.actions={...(draft.actions||{})};if(value)draft.actions[el('looks-action').value]=value;else delete draft.actions[el('looks-action').value];}else draft.sprite=value;}
  function atlasInputs(){const frames=Number(el('looks-frames').value),row_count=Number(el('looks-row-count').value),idle_frame=Number(el('looks-idle-frame').value)-1,walk_order=el('looks-walk-order').value.split(',').map(n=>Number(n.trim())-1),rows=Object.fromEntries(DIRECTIONS.map(d=>[d,Number(el('looks-row-'+d).value)-1]));const value={frames,row_count,idle_frame,walk_order,rows};validateAtlas({...value,image:'data:image/png;base64,AAAA'});return value;}
  function loadAtlasInputs(){const m=atlasMeta(currentAtlas()||(tab==='action'?{frames:4,row_count:1}:null));el('looks-frames').value=m.frames;el('looks-row-count').value=m.rowCount;el('looks-idle-frame').value=m.idle+1;el('looks-walk-order').value=m.order.map(n=>n+1).join(',');for(const d of DIRECTIONS)el('looks-row-'+d).value=m.rows[d]+1;}
  function renderSkins(){
    el('looks-skin-choice').disabled=false;el('looks-skin-choice').replaceChildren(...skinChoices(catalog).map(s=>new Option(s.name,s.id)));el('looks-skin-choice').value=editingSkin;
    el('looks-active-skin-name').textContent='当前穿着：'+skinChoices(catalog).find(s=>s.id===catalog.active_skin_id)?.name;
    el('looks-ai-auto').checked=catalog.auto_skin;el('looks-ai-auto').disabled=owner==='user';el('looks-ai-allowed').checked=draft.ai_allowed!==false;el('looks-delete-skin').disabled=editingSkin==='default';el('looks-rename-skin').disabled=editingSkin==='default';el('looks-skin-name').value=editingSkin==='default'?'':draft.name;
  }
  async function editSkin(id){generation++;stopPreview();editingSkin=id;draft=id==='default'?catalog:catalog.skins.find(s=>s.id===id);renderSkins();el('looks-skin').value=draft.skin;loadAtlasInputs();await preview();}
  function stopPreview(){clearInterval(timer);timer=null;playing=false;frame=0;el('looks-preview-play').textContent='播放行走';el('looks-preview-play').setAttribute('aria-pressed','false');el('looks-pose').textContent='站立';}
  async function spritePreview(){
    const value=draft,token=generation;if(!value)return;
    const sprite=currentAtlas(),m=atlasMeta(sprite),selected=playing?(tab==='action'?frame%m.frames:m.order[frame%m.order.length]):m.idle;
    await previewSprite(el('looks-sprite'),{...value,sprite},el('looks-direction').value,selected,()=>token===generation);
    if(token!==generation)return;
    el('looks-pose').textContent=(playing?(selected===m.idle?'站立':'播放中'):'站立')+' · 第 '+(selected+1)+' 帧';
    el('looks-sprite-name').textContent=sprite?'已上传这个人物的小人 PNG':tab==='action'?'尚未上传这个交互动作；执行时使用基础小人与现有动作效果':'使用这个人物的默认小人';
  }
  async function frameStrip(){
    const token=generation,value=draft,strip=el('world-looks-dialog').querySelector('.looks-frame-strip');strip.replaceChildren();
    const sprite=currentAtlas(),m=atlasMeta(sprite),order=tab==='action'?Array.from({length:m.frames},(_,i)=>i):m.order;
    for(const i of order){
      const card=node('figure'),c=node('canvas');c.width=96;c.height=96;card.append(c,node('figcaption','第 '+(i+1)+' 帧'+(i===m.idle?' · 站立':'')));strip.append(card);
      await previewSprite(c,{...value,sprite},el('looks-direction').value,i,()=>token===generation);if(token!==generation)return;
    }
  }
  async function preview(){
    const token=generation,value=draft,src=await portraitImage(value,people.find(p=>p.id===owner)?.avatar);if(token!==generation)return;el('looks-portrait').src=src;
    const select=el('looks-portrait-choice');select.replaceChildren();
    if(!draft.portraits.length)select.append(new Option('尚未上传 · 使用这个人物的头像或默认图','0'));
    draft.portraits.forEach((p,i)=>select.append(new Option(p.name,String(i))));select.value=String(draft.portrait);
    el('looks-remove-portrait').disabled=!draft.portraits.length;
    el('looks-emotion').value=draft.portraits[draft.portrait]?.emotion||'';el('looks-emotion').disabled=!draft.portraits.length;
    await spritePreview();await frameStrip();
  }
  async function select(){
    const token=++generation;stopPreview();owner=el('looks-owner').value;draft=null;catalog=null;el('looks-save').disabled=true;el('looks-skin-choice').disabled=true;
    for(const n of box.querySelectorAll('.looks-person-name'))n.textContent=people.find(p=>p.id===owner)?.name||'';
    const result=await api('/character-looks/'+owner);if(token!==generation)return;catalog=result;
    el('looks-status').textContent='';await editSkin(catalog.active_skin_id);el('looks-save').disabled=false;
  }
  function switchTab(value){if(draft)generation++;tab=value;stopPreview();for(const name of ['portrait','sprite','action'])el('looks-tab-'+name).setAttribute('aria-pressed',String(tab===name));el('looks-portrait-panel').hidden=tab!=='portrait';el('looks-sprite-panel').hidden=tab==='portrait';el('looks-action-label').hidden=tab!=='action';el('world-looks-dialog').querySelector('.looks-scroll').scrollTop=0;if(draft){loadAtlasInputs();void safe(preview)();}}
  for(const name of ['portrait','sprite','action'])el('looks-tab-'+name).onclick=()=>switchTab(name);
  el('looks-action').onchange=safe(async()=>{generation++;stopPreview();loadAtlasInputs();await preview();});
  el('looks-skin-choice').onchange=safe(()=>editSkin(el('looks-skin-choice').value));
  el('looks-add-skin').onclick=safe(async()=>{const name=el('looks-skin-name').value.trim();if(!name||name.length>40)throw Error('先填写新皮肤名称');if(catalog.skins.length>=8)throw Error('最多八套额外皮肤');const skin={id:'skin_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,6),name,skin:draft.skin,portraits:[],portrait:0,sprite:null,actions:{},ai_allowed:true};catalog.skins.push(skin);await editSkin(skin.id);});
  el('looks-rename-skin').onclick=safe(()=>{const name=el('looks-skin-name').value.trim();if(!name)throw Error('请填写皮肤名称');draft.name=name;renderSkins();});
  el('looks-delete-skin').onclick=safe(async()=>{catalog.skins=catalog.skins.filter(s=>s.id!==editingSkin);if(catalog.active_skin_id===editingSkin)catalog.active_skin_id='default';await editSkin('default');});
  el('looks-use-skin').onclick=()=>{catalog.active_skin_id=editingSkin;renderSkins();};
  el('looks-ai-auto').onchange=()=>{catalog.auto_skin=el('looks-ai-auto').checked;};el('looks-ai-allowed').onchange=()=>{draft.ai_allowed=el('looks-ai-allowed').checked;};
  el('looks-emotion').onchange=safe(async()=>{const emotion=el('looks-emotion').value;if(emotion&&draft.portraits.some((p,i)=>i!==draft.portrait&&p.emotion===emotion)){el('looks-emotion').value=draft.portraits[draft.portrait].emotion||'';throw Error('这套皮肤已有该表情，请先修改原图的分类');}if(emotion)draft.portraits[draft.portrait].emotion=emotion;else delete draft.portraits[draft.portrait].emotion;await preview();});
  el('looks-atlas-preset').onchange=()=>{const preset=el('looks-atlas-preset').value;el('looks-frames').value=preset==='three'?3:4;el('looks-row-count').value=preset==='action'?1:4;el('looks-idle-frame').value=preset==='three'?2:1;el('looks-walk-order').value=preset==='three'?'2,1,2,3':'1,2,3,4';const rows=preset==='rpg'?{down:1,right:2,up:3,left:4}:{down:1,left:2,right:3,up:4};for(const d of DIRECTIONS)el('looks-row-'+d).value=preset==='action'?1:rows[d];};
  el('looks-apply-atlas').onclick=safe(async()=>{const old=currentAtlas();if(!old)throw Error('先按填写的布局上传一张图集');const meta=atlasInputs(),token=generation,img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=old.image;});if(token!==generation)return;if(img.width%meta.frames||img.height%meta.row_count)throw Error('图片尺寸不能按这套布局均分');putAtlas({...old,...meta});stopPreview();await preview();});
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
  el('looks-sprite-file').onchange=safe(async e=>{if(!e.target.files[0]||!draft)return;const meta=atlasInputs(),token=generation,image=await readImage(e.target.files[0],{sprite:true,...meta});e.target.value='';if(token!==generation||!box.open)return;stopPreview();putAtlas({image,...meta});await preview();});
  el('looks-reset-sprite').onclick=safe(async()=>{putAtlas(null);loadAtlasInputs();await preview();});
  el('looks-save').onclick=safe(async()=>{if(!draft)return;const id=owner,token=generation,value=JSON.parse(JSON.stringify(catalog));await api('/character-looks/'+id,'PATCH',value);await refresh({light:true});if(token===generation)el('looks-status').textContent='人物形象已保存';toast((people.find(p=>p.id===id)?.name||'人物')+'的图片已保存');});
  el('looks-close').onclick=()=>box.close();
  box.addEventListener('close',()=>{generation++;stopPreview();resolveClose?.();resolveClose=null;});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&box.open){stopPreview();void safe(spritePreview)();}});
  return {async open(id){
    people=[{id:'user',name:'我'},...await api('/characters')];el('looks-owner').replaceChildren(...people.map(p=>new Option(p.name,p.id)));if(people.some(p=>p.id===id))el('looks-owner').value=id;
    await select();box.showModal();switchTab('portrait');
    return new Promise(resolve=>{resolveClose=resolve;});
  }};
}
