// SPDX-License-Identifier: AGPL-3.0-only
// UI submits recipes to the existing looks module; it never owns persistence.
import {OUTFIT_KINDS,outfitDrawingChange} from './outfit-catalog.js';
import {WALK_TEMPLATE} from './outfit-motion.js';
import {blankProject,importPixels,pixelCanvas,starterBody} from './outfit-image.js';
import {drawOutfit,outfitAtlas} from './outfit-compose.js';
import {mountClothingWorkbench} from './clothing-workbench-ui.js';
const clone=v=>JSON.parse(JSON.stringify(v));
const directions=['向下','向左','向右','向上'];
const targets={body:[8,8,48,80],hair:[14,8,36,36],hat:[14,8,36,36],accessory:[24,44,16,20],top:[18,44,28,20],bottom:[24,64,16,24],shoes:[24,82,16,6]};
export function mountOutfitWardrobe({api,report,toast,refresh}){
  const box=document.createElement('dialog');box.id='outfit-wardrobe';box.className='world-panel outfit-wardrobe';
  box.innerHTML=`<header><h2>衣柜</h2><button class="wardrobe-close">× 关闭</button></header><div class="wardrobe-scroll">
    <label>人物<select class="wardrobe-person"></select></label><div class="wardrobe-preview"><canvas aria-label="穿搭预览"></canvas><div><p class="wardrobe-height"></p><button class="wardrobe-short">矮一点</button><button class="wardrobe-tall">高一点</button><button class="wardrobe-play">播放行走</button></div></div>
    <nav aria-label="衣柜分类" class="wardrobe-kinds"></nav><div class="wardrobe-assets"></div>
    <div class="wardrobe-tools"><label>素材名称<input class="wardrobe-name" maxlength="40" placeholder="例如：绿色短袖"></label><button class="wardrobe-create">＋ 新建素材</button><button class="wardrobe-edit">绘制 / 修改</button><button class="wardrobe-copy">复制后修改</button><button class="wardrobe-delete">删除素材</button><button class="wardrobe-wear">穿上</button></div>
    <section class="wardrobe-detail"><h3>选中素材</h3><div class="wardrobe-directions"></div><label class="file-button">上传 / 替换此方向的站立图片<input class="wardrobe-upload" type="file" accept="image/png,image/jpeg,image/webp"></label><p>单张透明图片自动放入对应部位；画布为 64×96。站立素材沿模板生成迈步，修改某个迈步则作为独立姿势。</p>
    <div class="wardrobe-fit"><h3>在这个人物身上调整</h3><label>大小 %<input data-fit="scale" type="number" min="50" max="200" step="5"></label><label>左右像素<input data-fit="x" type="number" min="-32" max="32"></label><label>上下像素<input data-fit="y" type="number" min="-32" max="32"></label><p>只调整当前穿戴者，共享素材不变。</p></div></section>
    </div><footer><p class="wardrobe-status" role="status"></p><button class="wardrobe-apply primary">应用到世界</button></footer>`;
  document.body.append(box);const el=s=>box.querySelector(s);
  let catalog,people=[],owner='user',kind='body',selected='',direction=0,timer=null,step=0,busy=false,editing='';
  const person=()=>catalog.people[owner],asset=()=>catalog.assets.find(a=>a.id===selected);
  const status=s=>el('.wardrobe-status').textContent=s;
  const safe=fn=>async(...args)=>{if(busy)return;busy=true;lock();try{await fn(...args);}catch(e){report(e);status(e.message);}finally{busy=false;lock();}};
  function lock(){for(const control of box.querySelectorAll('button,input,select'))control.disabled=busy;}
  function stop(){clearInterval(timer);timer=null;step=0;el('.wardrobe-play').textContent='播放行走';}
  async function save(next){catalog=await api('/character-looks/user/workshop','PUT',{expected_revision:catalog.revision,catalog:next});}
  function preview(){
    const p=person(),c=el('.wardrobe-preview canvas');
    if(p)drawOutfit(c,catalog,p,direction,timer?WALK_TEMPLATE.order[step%4]:1);else{c.width=64;c.height=96;}
    el('.wardrobe-height').textContent=p?'人物身高 '+p.height+' 像素':'先选择一个本体';
  }
  function render(){
    const list=el('.wardrobe-assets');list.replaceChildren();
    for(const a of catalog.assets.filter(a=>a.kind===kind)){
      const b=document.createElement('button');b.className='wardrobe-card';b.setAttribute('aria-pressed',String(a.id===selected));
      const c=pixelCanvas(a.project,direction*3+1).cloneNode();c.getContext('2d').drawImage(pixelCanvas(a.project,direction*3+1),0,0);b.append(c,document.createTextNode(a.name));
      b.onclick=()=>{if(busy)return;selected=a.id;render();};list.append(b);
    }
    for(const b of box.querySelectorAll('[data-kind]'))b.setAttribute('aria-pressed',String(b.dataset.kind===kind));
    for(const b of box.querySelectorAll('[data-direction]')){b.setAttribute('aria-pressed',String(+b.dataset.direction===direction));b.textContent=directions[+b.dataset.direction]+(asset()?.ready[+b.dataset.direction]?' ✓':' · 缺图');}
    el('.wardrobe-detail').hidden=!asset();el('.wardrobe-name').value=asset()?.name||'';
    const worn=person()?.wear.find(w=>w.asset===selected);el('.wardrobe-fit').hidden=!worn;el('.wardrobe-wear').textContent=kind==='body'?'选为本体':worn?'脱下':'穿上';
    for(const input of box.querySelectorAll('[data-fit]'))input.value=input.dataset.fit==='scale'?(worn?.fit?.scale??1)*100:(worn?.fit?.[input.dataset.fit]??0);
    preview();
  }
  function renderLayer(canvas,project,index){
    canvas.width=64;canvas.height=96;const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
    const a=catalog.assets.find(a=>a.id===editing),base=catalog.assets.find(a=>a.id===person()?.body);
    if(a?.kind!=='body'&&base){ctx.globalAlpha=.25;ctx.drawImage(pixelCanvas(base.project,Math.floor(index/3)*3+1),0,0);ctx.globalAlpha=1;}
    ctx.drawImage(pixelCanvas(project,index),0,0);return canvas;
  }
  let painter;
  const makePainter=()=>mountClothingWorkbench({report,toast,assetMode:true,renderFrame:renderLayer,makeAtlas:null,api:async(_path,method='GET',body)=>{
    const a=catalog.assets.find(a=>a.id===editing);if(!a)throw Error('素材已删除');
    if(method==='GET')return {project:clone(a.project),draft:a.draft&&clone(a.draft),revision:catalog.revision};
    const next=outfitDrawingChange(catalog,editing,method,body);
    await save(next);return {revision:catalog.revision};
  }});
  for(const [id,label]of Object.entries(OUTFIT_KINDS)){const b=document.createElement('button');b.dataset.kind=id;b.textContent=label;b.onclick=()=>{if(busy)return;kind=id;selected=catalog.assets.find(a=>a.kind===id)?.id||'';stop();render();};el('.wardrobe-kinds').append(b);}
  directions.forEach((label,i)=>{const b=document.createElement('button');b.dataset.direction=i;b.onclick=()=>{if(busy)return;direction=i;stop();render();};el('.wardrobe-directions').append(b);});
  el('.wardrobe-person').onchange=e=>{owner=e.target.value;stop();render();};
  el('.wardrobe-create').onclick=safe(async()=>{const name=el('.wardrobe-name').value.trim();if(!name)throw Error('先填写素材名称');const next=clone(catalog),id=(globalThis.crypto?.randomUUID?.()||'outfit_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2));next.assets.push({id,name,kind,revision:0,template:WALK_TEMPLATE.id,ready:[false,false,false,false],project:blankProject()});await save(next);selected=id;render();});
  el('.wardrobe-edit').onclick=safe(async()=>{if(!asset())throw Error('先选择素材');editing=selected;stop();status('共享素材的修改会影响使用它的人物；需要独立版本可先复制。');painter=painter||makePainter();await painter.open(owner,editing,asset().name);render();});
  el('.wardrobe-copy').onclick=safe(async()=>{if(!asset())throw Error('先选择素材');const next=clone(catalog),a=clone(asset());a.id=(globalThis.crypto?.randomUUID?.()||'outfit_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2));a.name=a.name.slice(0,36)+' 副本';next.assets.push(a);await save(next);selected=a.id;render();});
  el('.wardrobe-delete').onclick=safe(async()=>{if(!asset())return;if(Object.values(catalog.people).some(p=>p.body===selected||p.wear.some(w=>w.asset===selected)))throw Error('素材正在使用，请先更换或脱下');const next=clone(catalog);next.assets=next.assets.filter(a=>a.id!==selected);await save(next);selected='';render();});
  el('.wardrobe-wear').onclick=safe(async()=>{const a=asset();if(!a)throw Error('先选择素材');const next=clone(catalog);if(kind==='body')next.people[owner]={body:a.id,height:person()?.height||80,wear:person()?.wear||[]};else{if(!person())throw Error('先为人物选择本体');const p=next.people[owner],existing=p.wear.some(w=>w.asset===a.id);p.wear=p.wear.filter(w=>catalog.assets.find(x=>x.id===w.asset).kind!==kind);if(!existing)p.wear.push({asset:a.id,fit:{scale:1,x:0,y:0}});}await save(next);render();status('穿搭已保存；确认预览后应用到世界。');});
  async function height(delta){if(!person())return;const next=clone(catalog);next.people[owner].height=Math.max(56,Math.min(80,person().height+delta));await save(next);render();}
  el('.wardrobe-short').onclick=safe(()=>height(-2));el('.wardrobe-tall').onclick=safe(()=>height(2));
  for(const input of box.querySelectorAll('[data-fit]')){input.addEventListener('wheel',()=>input.blur(),{passive:true});input.onchange=safe(async()=>{const next=clone(catalog),w=next.people[owner]?.wear.find(w=>w.asset===selected);if(!w)return;w.fit[input.dataset.fit]=Number(input.value)/(input.dataset.fit==='scale'?100:1);await save(next);render();});}
  el('.wardrobe-upload').onchange=safe(async e=>{const file=e.target.files[0];e.target.value='';if(!file||!asset())return;if(file.size>6000000)throw Error('图片最多 6 MB');const url=URL.createObjectURL(file);try{const frame=await importPixels(url,asset().project.colors,{target:targets[kind]}),next=clone(catalog),a=next.assets.find(a=>a.id===selected);for(let p=0;p<3;p++)a.project.frames[direction*3+p]=frame;a.ready[direction]=true;delete a.draft;await save(next);render();status('此方向已保存，可继续绘制姿势或调整穿戴位置。');}finally{URL.revokeObjectURL(url);}});
  el('.wardrobe-play').onclick=()=>{if(busy)return;if(timer){stop();preview();return;}el('.wardrobe-play').textContent='停止行走';timer=setInterval(()=>{step++;preview();},120);};
  el('.wardrobe-apply').onclick=safe(async()=>{if(!person())throw Error('先选择本体');stop();const sprite=outfitAtlas(catalog,person());await api('/character-looks/user/workshop-apply','POST',{owner,expected_revision:catalog.revision,sprite});await refresh();status('已应用到世界；旧皮肤保留。');toast('穿搭已应用');});
  el('.wardrobe-close').onclick=()=>{if(!busy)box.close();};box.addEventListener('cancel',e=>{if(busy)e.preventDefault();});box.addEventListener('close',stop);document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  return {async open(id='user'){
    if(box.open)return;catalog=await api('/character-looks/user/workshop');people=await api('/characters');owner=id;
    el('.wardrobe-person').replaceChildren(...[{id:'user',name:'我'},...people].map(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.name;return o;}));el('.wardrobe-person').value=owner;
    if(!catalog.assets.length){const project=await starterBody(),next=clone(catalog);next.assets.push({id:'owner_base',name:'原创素体',kind:'body',revision:0,template:WALK_TEMPLATE.id,ready:[true,true,true,true],project});next.people[owner]={body:'owner_base',height:80,wear:[]};await save(next);}
    kind='body';selected=person()?.body||catalog.assets.find(a=>a.kind==='body')?.id||'';direction=0;stop();render();status('素材共享，穿搭按人物保存。各方向可上传或绘制，修改后需重新应用。');box.showModal();
  }};
}
