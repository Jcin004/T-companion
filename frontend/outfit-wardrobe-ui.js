// SPDX-License-Identifier: AGPL-3.0-only
// UI submits recipes to the existing looks module; it never owns persistence.
import {OUTFIT_KINDS,outfitDrawingChange} from './outfit-catalog.js';
import {resolvedGarment,ensureAdaptation,wearGarment,adaptationDrawingChange} from './outfit-adaptation.js';
import {drawingSize} from './clothing-project.js';
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
    <label class="wardrobe-person-label">试穿人物<select class="wardrobe-person"></select></label>
    <div class="wardrobe-dressing"><nav class="wardrobe-slots wardrobe-slots-left" aria-label="头部穿戴"></nav>
      <div class="wardrobe-mirror"><div class="wardrobe-preview"><canvas aria-label="穿搭预览"></canvas></div>
        <div class="wardrobe-turn"><button class="wardrobe-turn-left" aria-label="向左转身">‹</button><span class="wardrobe-facing">正面</span><button class="wardrobe-turn-right" aria-label="向右转身">›</button></div>
        <button class="wardrobe-play">播放行走</button></div>
      <nav class="wardrobe-slots wardrobe-slots-right" aria-label="身体穿戴"></nav></div>
    <nav class="wardrobe-pages" aria-label="衣柜页面"><button data-page="clothes" aria-pressed="true">公共衣柜</button><button data-page="sets">整套搭配</button></nav>
    <section class="wardrobe-clothes"><p class="wardrobe-category"></p><div class="wardrobe-assets"></div>
      <div class="wardrobe-selection"><span class="wardrobe-selected-name"></span><button class="wardrobe-wear">穿上</button><button class="wardrobe-fit-open">调整我的穿着</button></div>
      <details class="wardrobe-fit"><summary>这个人物的适配</summary><p>只改变这个人物，脱下后也会保留。</p><div class="wardrobe-fit-fields"><label>大小 %<input data-fit="scale" type="number" min="50" max="200" step="5"></label><label>左右<input data-fit="x" type="number" min="-32" max="32"></label><label>上下<input data-fit="y" type="number" min="-32" max="32"></label></div><button class="wardrobe-adapt-edit">绘制这个人物的适配</button><button class="wardrobe-adapt-reset">使用最新版重新适配</button></details>
      <button class="wardrobe-manage-open">制作 / 管理衣物</button>
    </section>
    <section class="wardrobe-sets" hidden><div class="wardrobe-set-list"></div><label>搭配名称<input class="wardrobe-set-name" maxlength="40" placeholder="例如：日常装"></label><button class="wardrobe-set-save">将当前穿搭存成一套</button><p>搭配共用衣物，每个人保留自己的适配。</p></section>
    <section class="wardrobe-management" hidden><header><h3>公共原版制作</h3><button class="wardrobe-manage-close">完成</button></header><p>在标准素体上制作；人物已经保存的适配保留原样。</p><nav class="wardrobe-kinds"></nav>
      <div class="wardrobe-tools"><label>素材名称<input class="wardrobe-name" maxlength="40" placeholder="例如：白衬衫"></label><button class="wardrobe-create">＋ 新建原版</button><button class="wardrobe-edit">编辑公共原版</button><button class="wardrobe-copy">另存一件</button><button class="wardrobe-delete">删除原版</button></div>
      <section class="wardrobe-detail"><div class="wardrobe-directions"></div><label class="file-button">上传 / 替换原版这个方向<input class="wardrobe-upload" type="file" accept="image/png,image/jpeg,image/webp"></label><p>上传透明站立图，再到绘画台补充细节。</p></section>
      <details class="wardrobe-body"><summary>人物本体</summary><p>本体可上传和绘画。更换本体保留衣物。</p><p class="wardrobe-height"></p><button class="wardrobe-short">矮一点</button><button class="wardrobe-tall">高一点</button><button class="wardrobe-body-wear">选为本体</button></details>
    </section>
    </div><footer><p class="wardrobe-status" role="status"></p><button class="wardrobe-apply primary">穿好并应用到世界</button></footer>`;
  document.body.append(box);const el=s=>box.querySelector(s);
  let catalog,people=[],owner='user',kind='body',selected='',direction=0,timer=null,step=0,busy=false,editing='',editMode='original',page='clothes';
  const person=()=>catalog.people[owner],asset=()=>catalog.assets.find(a=>a.id===selected);
  const status=s=>el('.wardrobe-status').textContent=s;
  const safe=fn=>async(...args)=>{if(busy)return;busy=true;lock();try{await fn(...args);}catch(e){report(e);status(e.message);}finally{busy=false;lock();}};
  function lock(){for(const control of box.querySelectorAll('button,input,select'))control.disabled=busy;}
  function stop(){clearInterval(timer);timer=null;step=0;el('.wardrobe-play').textContent='播放行走';}
  async function save(next){catalog=await api('/character-looks/user/workshop','PUT',{expected_revision:catalog.revision,catalog:next,request_id:uid()});}
  const uid=()=>globalThis.crypto?.randomUUID?.()||'outfit_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);
  const worn=()=>person()?.wear.find(w=>w.asset===selected);
  function chooseKind(id){kind=id;selected=person()?.wear.find(w=>catalog.assets.find(a=>a.id===w.asset)?.kind===id)?.asset||catalog.assets.find(a=>a.kind===id)?.id||'';stop();render();}
  function preview(){
    const p=person(),c=el('.wardrobe-preview canvas');
    if(p)drawOutfit(c,catalog,p,direction,timer?WALK_TEMPLATE.order[step%4]:1);else{c.width=64;c.height=96;}
    el('.wardrobe-facing').textContent=['正面','左侧','右侧','背面'][direction];
    el('.wardrobe-height').textContent=p?'人物身高 '+p.height+' 像素':'先选择一个本体';
  }
  function thumbnail(project,itemKind){
    const image=pixelCanvas(project,direction*3+1),scale=drawingSize(project).scale,r=targets[itemKind],c=document.createElement('canvas');
    c.width=r[2]*scale;c.height=r[3]*scale;c.getContext('2d').drawImage(image,...r.map(n=>n*scale),0,0,c.width,c.height);return c;
  }
  function render(){
    const list=el('.wardrobe-assets');list.replaceChildren();
    for(const a of catalog.assets.filter(a=>a.kind===kind)){
      const b=document.createElement('button');b.className='wardrobe-card';b.setAttribute('aria-pressed',String(a.id===selected));
      const c=thumbnail(a.project,a.kind);b.append(c,document.createTextNode(a.name));
      b.onclick=()=>{if(busy)return;selected=a.id;render();if(a.kind!=='body'&&el('.wardrobe-management').hidden&&!worn())el('.wardrobe-wear').click();};list.append(b);
    }
    for(const b of box.querySelectorAll('[data-kind]'))b.setAttribute('aria-pressed',String(b.dataset.kind===kind));
    for(const b of box.querySelectorAll('[data-direction]')){b.setAttribute('aria-pressed',String(+b.dataset.direction===direction));b.textContent=directions[+b.dataset.direction]+(asset()?.ready[+b.dataset.direction]?' ✓':' · 缺图');}
    el('.wardrobe-detail').hidden=!asset();el('.wardrobe-name').value=asset()?.name||'';
    el('.wardrobe-clothes').hidden=page!=='clothes';el('.wardrobe-sets').hidden=page!=='sets';
    for(const b of box.querySelectorAll('[data-page]'))b.setAttribute('aria-pressed',String(b.dataset.page===page));
    el('.wardrobe-category').textContent=(OUTFIT_KINDS[kind]||'衣物')+' · 所有人共用';
    el('.wardrobe-selection').hidden=!asset()||kind==='body';
    el('.wardrobe-selected-name').textContent=asset()?.name||'';
    const wearing=worn();el('.wardrobe-fit').hidden=!wearing;el('.wardrobe-fit-open').hidden=!wearing;
    el('.wardrobe-wear').textContent=wearing?'脱下':'穿上';
    for(const input of box.querySelectorAll('[data-fit]'))input.value=input.dataset.fit==='scale'?(wearing?.fit?.scale??1)*100:(wearing?.fit?.[input.dataset.fit]??0);
    for(const b of box.querySelectorAll('[data-slot]')){
      const item=person()?.wear.find(w=>catalog.assets.find(a=>a.id===w.asset)?.kind===b.dataset.slot),a=catalog.assets.find(a=>a.id===item?.asset);
      b.replaceChildren();if(a){const c=thumbnail(resolvedGarment(a,person()).project,a.kind);b.append(c);}b.append(document.createTextNode(OUTFIT_KINDS[b.dataset.slot]));b.setAttribute('aria-pressed',String(kind===b.dataset.slot));
    }
    const sets=el('.wardrobe-set-list');sets.replaceChildren();
    for(const set of catalog.sets||[]){const row=document.createElement('div'),use=document.createElement('button'),remove=document.createElement('button');use.textContent=set.name+' · 试穿';remove.textContent='删除';remove.setAttribute('aria-label','删除搭配 '+set.name);use.onclick=safe(async()=>{if(!person())throw Error('先选择本体');const next=clone(catalog),p=next.people[owner];p.wear=[];for(const id of set.assets)wearGarment(p,next.assets.find(a=>a.id===id));await save(next);render();status('已穿上这套搭配，保留此人物的适配');});remove.onclick=safe(async()=>{const next=clone(catalog);next.sets=next.sets.filter(s=>s.id!==set.id);await save(next);render();});row.append(use,remove);sets.append(row);}
    if(!catalog.assets.some(a=>a.kind===kind))list.textContent='衣柜里还没有'+OUTFIT_KINDS[kind]+'，可以在制作入口添加。';
    preview();
  }
  function renderLayer(canvas,project,index){
    const {width,height}=drawingSize(project);canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
    const a=catalog.assets.find(a=>a.id===editing),base=editMode==='adaptation'?catalog.assets.find(a=>a.id===person()?.body):catalog.assets.find(a=>a.kind==='body');
    if(a?.kind!=='body'&&base){ctx.globalAlpha=.25;ctx.drawImage(pixelCanvas(base.project,Math.floor(index/3)*3+1),0,0,width,height);ctx.globalAlpha=1;}
    ctx.drawImage(pixelCanvas(project,index),0,0);return canvas;
  }
  let painter;
  const makePainter=()=>mountClothingWorkbench({report,toast,assetMode:true,renderFrame:renderLayer,makeAtlas:null,api:async(_path,method='GET',body)=>{
    const a=catalog.assets.find(a=>a.id===editing);if(!a)throw Error('素材已删除');
    if(method==='GET'){
      const adjustment=editMode==='adaptation'?person()?.adaptations?.[editing]:null,source=editMode==='adaptation'?resolvedGarment(a,person()):a;
      return {project:clone(source.project),draft:(adjustment?.draft||editMode==='original'&&a.draft)||undefined,revision:catalog.revision};
    }
    const next=editMode==='adaptation'?adaptationDrawingChange(catalog,owner,editing,method,body):outfitDrawingChange(catalog,editing,method,body);
    await save(next);return {revision:catalog.revision};
  }});
  for(const [id,label]of Object.entries(OUTFIT_KINDS)){const b=document.createElement('button');b.dataset.kind=id;b.textContent=label;b.onclick=()=>{if(busy)return;chooseKind(id);};el('.wardrobe-kinds').append(b);}
  directions.forEach((label,i)=>{const b=document.createElement('button');b.dataset.direction=i;b.onclick=()=>{if(busy)return;direction=i;stop();render();};el('.wardrobe-directions').append(b);});
  for(const [slot,side]of [['hair','left'],['hat','left'],['accessory','left'],['top','right'],['bottom','right'],['shoes','right']]){const b=document.createElement('button');b.dataset.slot=slot;b.onclick=()=>{if(!busy)chooseKind(slot);};el('.wardrobe-slots-'+side).append(b);}
  for(const b of box.querySelectorAll('[data-page]'))b.onclick=()=>{page=b.dataset.page;render();};
  el('.wardrobe-manage-open').onclick=()=>{el('.wardrobe-management').hidden=false;el('.wardrobe-management').scrollIntoView({block:'start'});};
  el('.wardrobe-manage-close').onclick=()=>{el('.wardrobe-management').hidden=true;};
  el('.wardrobe-fit-open').onclick=()=>{el('.wardrobe-fit').open=!el('.wardrobe-fit').open;};
  const turn=delta=>{direction=[0,2,3,1][([0,2,3,1].indexOf(direction)+delta+4)%4];stop();render();};
  el('.wardrobe-turn-left').onclick=()=>turn(-1);el('.wardrobe-turn-right').onclick=()=>turn(1);
  el('.wardrobe-person').onchange=e=>{owner=e.target.value;chooseKind(kind==='body'?'top':kind);el('.wardrobe-fit').open=false;};
  el('.wardrobe-set-save').onclick=safe(async()=>{if(!person()?.wear.length)throw Error('先穿上衣物');const name=el('.wardrobe-set-name').value.trim();if(!name)throw Error('给这套搭配起个名字');const next=clone(catalog);if(!next.sets)next.sets=[];next.sets.push({id:uid(),name,assets:person().wear.map(w=>w.asset)});await save(next);el('.wardrobe-set-name').value='';render();status('搭配已保存，其他人物也能试穿');});
  el('.wardrobe-adapt-edit').onclick=safe(async()=>{if(!worn())throw Error('先穿上这件衣物');editMode='adaptation';editing=selected;stop();painter=painter||makePainter();await painter.open(owner,editing,'此人物适配 · '+asset().name);render();});
  el('.wardrobe-adapt-reset').onclick=safe(async()=>{if(!worn())return;if(!confirm('使用最新版并清除这个人物对这件衣服的绘画、草稿和位置调整？'))return;const next=clone(catalog),p=next.people[owner];delete p.adaptations?.[selected];const a=ensureAdaptation(p,next.assets.find(a=>a.id===selected));a.fit={scale:1,x:0,y:0};p.wear.find(w=>w.asset===selected).fit=clone(a.fit);await save(next);render();});
  el('.wardrobe-create').onclick=safe(async()=>{const name=el('.wardrobe-name').value.trim();if(!name)throw Error('先填写素材名称');const next=clone(catalog),id=(globalThis.crypto?.randomUUID?.()||'outfit_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2));next.assets.push({id,name,kind,revision:0,template:WALK_TEMPLATE.id,ready:[false,false,false,false],project:blankProject()});await save(next);selected=id;render();});
  el('.wardrobe-edit').onclick=safe(async()=>{if(!asset())throw Error('先选择素材');editing=selected;editMode='original';stop();status('编辑公共原版；人物已保存的适配保持原样。');painter=painter||makePainter();await painter.open(owner,editing,asset().name);render();});
  el('.wardrobe-copy').onclick=safe(async()=>{if(!asset())throw Error('先选择素材');const next=clone(catalog),a=clone(asset());a.id=(globalThis.crypto?.randomUUID?.()||'outfit_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2));a.name=a.name.slice(0,36)+' 副本';a.revision=0;delete a.editions;next.assets.push(a);await save(next);selected=a.id;render();});
  el('.wardrobe-delete').onclick=safe(async()=>{if(!asset())return;if(Object.values(catalog.people).some(p=>p.body===selected||p.wear.some(w=>w.asset===selected)))throw Error('素材正在使用，请先更换或脱下');if((catalog.sets||[]).some(s=>s.assets.includes(selected)))throw Error('搭配正在引用这件衣物，请先删除对应搭配');if(Object.values(catalog.people).some(p=>p.adaptations?.[selected])&&!confirm('删除原版也会清除这件衣物已保存的人物适配，继续？'))return;const next=clone(catalog);for(const p of Object.values(next.people))if(p.adaptations)delete p.adaptations[selected];next.assets=next.assets.filter(a=>a.id!==selected);await save(next);selected='';render();});
  el('.wardrobe-wear').onclick=safe(async()=>{const a=asset();if(!a||a.kind==='body')return;if(!person())throw Error('先到制作入口选择人物本体');const next=clone(catalog),p=next.people[owner],existing=p.wear.some(w=>w.asset===a.id);p.wear=p.wear.filter(w=>catalog.assets.find(x=>x.id===w.asset).kind!==kind);if(!existing)wearGarment(p,a);await save(next);render();status('穿搭已保存，确认后应用到世界');});
  el('.wardrobe-body-wear').onclick=safe(async()=>{if(asset()?.kind!=='body')throw Error('先选择人物本体');const next=clone(catalog);next.people[owner]={...next.people[owner],body:selected,height:person()?.height||80,wear:person()?.wear||[]};await save(next);render();});
  async function height(delta){if(!person())return;const next=clone(catalog);next.people[owner].height=Math.max(56,Math.min(80,person().height+delta));await save(next);render();}
  el('.wardrobe-short').onclick=safe(()=>height(-2));el('.wardrobe-tall').onclick=safe(()=>height(2));
  for(const input of box.querySelectorAll('[data-fit]')){input.addEventListener('wheel',()=>input.blur(),{passive:true});input.onchange=safe(async()=>{const next=clone(catalog),w=next.people[owner]?.wear.find(w=>w.asset===selected);if(!w)return;w.fit[input.dataset.fit]=Number(input.value)/(input.dataset.fit==='scale'?100:1);ensureAdaptation(next.people[owner],next.assets.find(a=>a.id===selected)).fit=clone(w.fit);await save(next);render();});}
  el('.wardrobe-upload').onchange=safe(async e=>{const file=e.target.files[0];e.target.value='';if(!file||!asset())return;if(file.size>6000000)throw Error('图片最多 6 MB');const url=URL.createObjectURL(file);try{const frame=await importPixels(url,asset().project.colors,{target:targets[kind],pixelScale:drawingSize(asset().project).scale}),next=clone(catalog),a=next.assets.find(a=>a.id===selected);for(let p=0;p<3;p++)a.project.frames[direction*3+p]=frame;a.ready[direction]=true;delete a.draft;await save(next);render();status('此方向已保存，可继续绘制姿势或调整穿戴位置。');}finally{URL.revokeObjectURL(url);}});
  el('.wardrobe-play').onclick=()=>{if(busy)return;if(timer){stop();preview();return;}el('.wardrobe-play').textContent='停止行走';timer=setInterval(()=>{step++;preview();},120);};
  el('.wardrobe-apply').onclick=safe(async()=>{if(!person())throw Error('先选择本体');stop();const sprite=outfitAtlas(catalog,person());await api('/character-looks/user/workshop-apply','POST',{owner,expected_revision:catalog.revision,sprite});await refresh();status('已应用到世界；旧皮肤保留。');toast('穿搭已应用');});
  el('.wardrobe-close').onclick=()=>{if(!busy)box.close();};box.addEventListener('cancel',e=>{if(busy)e.preventDefault();});box.addEventListener('close',stop);document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  return {async open(id='user'){
    if(box.open)return;catalog=await api('/character-looks/user/workshop');people=await api('/characters');owner=id;
    el('.wardrobe-person').replaceChildren(...[{id:'user',name:'我'},...people].map(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.name;return o;}));el('.wardrobe-person').value=owner;
    if(!catalog.assets.length){const project=await starterBody(),next=clone(catalog);next.assets.push({id:'owner_base',name:'原创素体',kind:'body',revision:0,template:WALK_TEMPLATE.id,ready:[true,true,true,true],project});next.people[owner]={body:'owner_base',height:80,wear:[]};await save(next);}
    page='clothes';kind='top';selected=person()?.wear.find(w=>catalog.assets.find(a=>a.id===w.asset)?.kind===kind)?.asset||catalog.assets.find(a=>a.kind===kind)?.id||'';direction=0;el('.wardrobe-management').hidden=true;el('.wardrobe-fit').open=false;stop();render();status('选穿戴格挑衣服；所有人物共用这个衣柜。');box.showModal();
  }};
}
