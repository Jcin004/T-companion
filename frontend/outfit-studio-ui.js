// SPDX-License-Identifier: AGPL-3.0-only
// Original-asset library/editor. Wardrobe bindings remain owned by the catalog API.
import {OUTFIT_KINDS,outfitDrawingChange} from './outfit-catalog.js';
import {drawingSize} from './clothing-project.js';
import {blankProject,importPixels,pixelCanvas} from './outfit-image.js';
import {WALK_TEMPLATE} from './outfit-motion.js';
import {mountClothingWorkbench} from './clothing-workbench-ui.js';
const copy=value=>JSON.parse(JSON.stringify(value));
const directions=['向下','向左','向右','向上'];
const targets={body:[8,8,48,80],hair:[14,8,36,36],hat:[14,8,36,36],accessory:[24,44,16,20],top:[18,44,28,20],bottom:[24,64,16,24],shoes:[24,82,16,6]};
const uid=()=>globalThis.crypto?.randomUUID?.()||'source_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);
export function mountOutfitStudio({getCatalog,save,report,toast}){
  const box=document.createElement('dialog');box.id='outfit-studio';box.className='world-panel outfit-studio';
  box.innerHTML=`<header><button class="source-back">返回</button><h2 class="source-title">衣物制作</h2><button class="source-close" aria-label="关闭制作">×</button></header>
    <div class="source-scroll"><section class="source-library"><nav class="source-kinds" aria-label="制作分类"></nav><div class="source-assets"></div><button class="source-create">＋ 新建</button></section>
    <section class="source-editor" hidden><label>名称<input class="source-name" maxlength="40"></label><p class="source-explanation">点击方向图片选择，上传或绘制；修改原版不会改变已保存的人物适配。</p><div class="source-directions" role="group" aria-label="原版方向"></div>
      <div class="source-image-tools"><label class="file-button">上传这个方向<input class="source-upload" type="file" accept="image/png,image/jpeg,image/webp"></label><button class="source-paint">绘制 / 修改</button></div>
      <label class="source-order-label">这个方向的遮挡<select class="source-order"><option value="default">默认位置</option><option value="behind">在身体后面</option><option value="front">在最前面</option></select></label>
      <div class="source-body-controls" hidden><label>此人物身高（像素）<input class="source-height" type="number" min="56" max="80" step="1"></label><button class="source-use-body">设为此人物本体</button></div>
      <details class="source-more"><summary>更多</summary><button class="source-copy">另存一件</button><button class="source-delete">删除原版</button></details>
    </section></div><footer><p class="source-status" role="status"></p><button class="source-save primary" hidden>保存原版</button></footer>`;
  document.body.append(box);const el=s=>box.querySelector(s);
  let mode='garment',kind='top',selected='',owner='user',direction=0,busy=false,painter,resolveClose,name='',order=[];
  const catalog=()=>getCatalog(),asset=()=>catalog().assets.find(a=>a.id===selected);
  const message=value=>el('.source-status').textContent=value;
  const safe=fn=>async(...args)=>{if(busy)return;busy=true;lock();try{await fn(...args);}catch(e){report(e);message(e.message);}finally{busy=false;lock();}};
  function lock(){for(const c of box.querySelectorAll('button,input,select'))c.disabled=busy;}
  function loadFields(){name=asset()?.name||'';order=copy(asset()?.draw_order||['default','default','default','default']);el('.source-name').value=name;}
  function unsaved(){return !!asset()&&(el('.source-name').value!==name||JSON.stringify(order)!==JSON.stringify(asset().draw_order||['default','default','default','default']));}
  function leave(){return !unsaved()||confirm('放弃未保存的名称和遮挡调整？上传与绘画草稿会保留。');}
  function drawCards(){
    el('.source-directions').replaceChildren();const a=asset();if(!a)return;
    const project=a.draft||a.project;
    directions.forEach((label,i)=>{const b=document.createElement('button'),c=pixelCanvas(project,i*3+1);b.dataset.sourceDirection=i;b.setAttribute('aria-pressed',String(direction===i));b.append(c,document.createTextNode(label+(/[^0]/.test(project.frames[i*3+1])?'':' · 缺图')));b.onclick=()=>{if(busy)return;direction=i;el('.source-order').value=order[i];drawCards();};el('.source-directions').append(b);});
  }
  function render(){
    const editing=!!asset();el('.source-library').hidden=editing;el('.source-editor').hidden=!editing;el('.source-save').hidden=!editing;
    el('.source-title').textContent=editing?OUTFIT_KINDS[kind]+' · '+asset().name:mode==='body'?'人物本体编辑':'衣物制作';
    el('.source-explanation').textContent=mode==='body'?'本体原版可以共用。要制作独立样子，可在更多中另存，再选为此人物本体。':'点击方向图片选择，上传或绘制；修改原版不会改变已保存的人物适配。';
    el('.source-body-controls').hidden=mode!=='body';el('.source-order-label').hidden=mode==='body';
    el('.source-kinds').hidden=mode==='body';
    for(const b of box.querySelectorAll('[data-source-kind]'))b.setAttribute('aria-pressed',String(b.dataset.sourceKind===kind));
    const list=el('.source-assets');list.replaceChildren();
    for(const a of catalog().assets.filter(a=>a.kind===kind)){
      const b=document.createElement('button');b.className='source-card';b.append(pixelCanvas(a.project,1),document.createTextNode(a.name));b.onclick=()=>{if(busy)return;selected=a.id;direction=0;loadFields();render();el('.source-scroll').scrollTop=0;message(a.draft?'有未保存为原版的绘画草稿':'');};list.append(b);
    }
    if(!list.childElementCount)list.textContent='还没有'+OUTFIT_KINDS[kind]+'，可以新建后上传或绘制。';
    if(editing){drawCards();el('.source-order').value=order[direction];el('.source-height').value=catalog().people[owner]?.height||80;}
  }
  async function saveOriginal(){
    const a=asset();if(!a)throw Error('先选择原版');const title=el('.source-name').value.trim();if(!title)throw Error('请填写名称');
    const next=outfitDrawingChange(catalog(),selected,'POST',{expected_revision:catalog().revision,project:a.draft||a.project}),target=next.assets.find(a=>a.id===selected);target.name=title;
    if(mode!=='body')target.draw_order=copy(order);
    await save(next);loadFields();render();message('原版已保存，已有人物适配保留原样');
  }
  function makePainter(){return mountClothingWorkbench({assetMode:true,editorId:'outfit-source-painter',report,toast,makeAtlas:null,
    renderFrame(canvas,project,index){
      const {width,height}=drawingSize(project);canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
      const base=catalog().assets.find(a=>a.kind==='body');if(mode!=='body'&&base){ctx.globalAlpha=.2;ctx.drawImage(pixelCanvas(base.project,Math.floor(index/3)*3+1),0,0,width,height);ctx.globalAlpha=1;}
      ctx.drawImage(pixelCanvas(project,index),0,0);return canvas;
    },api:async(_path,method='GET',body)=>{
      const a=asset();if(!a)throw Error('原版已删除');
      if(method==='GET')return {project:copy(a.project),draft:a.draft&&copy(a.draft),revision:catalog().revision};
      const next=outfitDrawingChange(catalog(),selected,method,body),target=next.assets.find(a=>a.id===selected);
      if(method==='POST'){target.name=el('.source-name').value.trim()||a.name;if(mode!=='body')target.draw_order=copy(order);}
      await save(next);if(method==='POST')loadFields();return {revision:catalog().revision};
    }});}
  for(const [id,label]of Object.entries(OUTFIT_KINDS).filter(([id])=>id!=='body')){
    const b=document.createElement('button');b.dataset.sourceKind=id;b.textContent=label;b.onclick=()=>{if(busy)return;kind=id;selected='';render();};el('.source-kinds').append(b);
  }
  el('.source-back').onclick=()=>{if(busy||!leave())return;if(selected){selected='';render();message('');}else box.close();};
  el('.source-close').onclick=()=>{if(!busy&&leave())box.close();};box.addEventListener('cancel',e=>{e.preventDefault();el('.source-close').click();});box.addEventListener('close',()=>{resolveClose?.();resolveClose=null;});
  el('.source-order').onchange=()=>{order[direction]=el('.source-order').value;message('遮挡调整待保存');};
  el('.source-save').onclick=safe(saveOriginal);
  el('.source-create').onclick=safe(async()=>{const next=copy(catalog());selected=uid();next.assets.push({id:selected,name:'未命名'+OUTFIT_KINDS[kind],kind,revision:0,template:WALK_TEMPLATE.id,ready:[false,false,false,false],project:blankProject()});await save(next);direction=0;loadFields();render();el('.source-name').focus();el('.source-name').select();message('起个名字，再点击方向上传或绘制');});
  el('.source-upload').onchange=safe(async e=>{
    const file=e.target.files[0];e.target.value='';if(!file||!asset())return;if(file.size>6000000)throw Error('图片最多 6 MB');
    const url=URL.createObjectURL(file);try{
      const a=asset(),project=copy(a.draft||a.project),frame=await importPixels(url,project.colors,{target:targets[kind],pixelScale:drawingSize(project).scale});
      for(let pose=0;pose<3;pose++)project.frames[direction*3+pose]=frame;
      await save(outfitDrawingChange(catalog(),selected,'PATCH',{expected_revision:catalog().revision,project}));drawCards();message('上传草稿已保存，确认后点保存原版');
    }finally{URL.revokeObjectURL(url);}
  });
  el('.source-paint').onclick=safe(async()=>{painter=painter||makePainter();await painter.open(owner,selected,OUTFIT_KINDS[kind]+' · '+asset().name);drawCards();message(asset().draft?'绘画草稿已保留，可继续编辑或保存原版':'原版已保存');});
  el('.source-copy').onclick=safe(async()=>{if(!leave())return;const next=copy(catalog()),a=copy(asset());a.id=uid();a.name=a.name.slice(0,36)+' 副本';a.revision=0;delete a.editions;delete a.draft;next.assets.push(a);await save(next);selected=a.id;loadFields();render();});
  el('.source-delete').onclick=safe(async()=>{
    const a=asset();if(Object.values(catalog().people).some(p=>p.body===a.id||p.wear.some(w=>w.asset===a.id)))throw Error('原版正在使用，请先更换或脱下');
    if(catalog().sets?.some(s=>s.assets.includes(a.id)))throw Error('搭配正在引用，请先删除对应搭配');
    if(!confirm('删除「'+a.name+'」及它的人物适配和草稿？'))return;const next=copy(catalog());for(const p of Object.values(next.people))if(p.adaptations)delete p.adaptations[a.id];next.assets=next.assets.filter(x=>x.id!==a.id);await save(next);selected='';render();message('原版已删除');
  });
  el('.source-use-body').onclick=safe(async()=>{const height=Number(el('.source-height').value);await saveOriginal();const next=copy(catalog());next.people[owner]={...next.people[owner],body:selected,height,wear:next.people[owner]?.wear||[]};await save(next);render();message('本体已选用，回衣柜确认后应用到世界');});
  for(const input of box.querySelectorAll('input[type=number]'))input.addEventListener('wheel',()=>input.blur(),{passive:true});
  return {async open(options){
    if(box.open)return;mode=options.mode;owner=options.owner;kind=mode==='body'?'body':options.kind==='body'?'top':options.kind||'top';selected=mode==='body'?catalog().people[owner]?.body||'':'';direction=0;loadFields();render();message('');box.showModal();el('.source-scroll').scrollTop=0;return new Promise(resolve=>resolveClose=resolve);
  }};
}
