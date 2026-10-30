// SPDX-License-Identifier: AGPL-3.0-only
import {portraitImage,previewSprite} from './world-art.js';
import {skinChoices,expressionChoices,ACTIONS} from './character-looks.js';
import {mountAtlasEditor} from './character-atlas-ui.js';
import {mountClothingWorkbench} from './clothing-workbench-ui.js';
import {bindCharacterImageInput,readCharacterPicture as readImage} from './character-image-input.js';
import {jsonSnapshot as copy} from './json-snapshot.js';
const fingerprint=v=>JSON.stringify(v,(_,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])):value);
const node=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
export function mountCharacterLooksUI({api,refresh,toast,report,pickArchive}){
  const box=node('dialog');box.id='world-looks-dialog';box.className='world-panel';
  box.innerHTML=`<header class="looks-heading"><div class="looks-title"><button id="looks-back" aria-label="返回上一级">‹ 返回</button><div><h2 id="looks-title">人物形象</h2><small id="looks-subtitle"></small></div><button id="looks-close" aria-label="关闭人物形象">× 关闭</button></div>
    <nav class="looks-tabs" id="looks-tabs" role="tablist" aria-label="皮肤图片" hidden>${[['portrait','表情立绘'],['sprite','站立行走'],['action','交互动作']].map(([id,name])=>`<button id="looks-tab-${id}" role="tab" aria-controls="looks-${id}-panel" aria-selected="false">${name}</button>`).join('')}</nav></header>
    <div class="looks-scroll"><p id="looks-notice" role="status"></p><section id="looks-people"><p>选择要调整形象的人物</p><div id="looks-person-cards"></div></section>
    <section id="looks-wardrobe" hidden><div class="looks-wardrobe-tools"><button id="looks-add-skin">＋ 添加皮肤</button><label class="looks-checkbox" id="looks-ai-setting"><input id="looks-ai-auto" type="checkbox">允许自主换装</label></div><div id="looks-skin-cards"></div></section>
    <section id="looks-editor" hidden>
      <section id="looks-portrait-panel" role="tabpanel"><div class="looks-previews"><img id="looks-portrait" alt="对话立绘预览"></div><div id="looks-expression-cards" aria-label="表情图片"></div>
      <div class="looks-resource-tools"><button id="looks-add-expression">＋ 添加表情</button><button id="looks-delete-expression" class="looks-text-button" hidden>删除这个表情</button></div><label class="file-button">上传 / 替换选中表情<input id="looks-portrait-file" type="file" accept="image/png,image/jpeg,image/webp"></label><button id="looks-pick-archive">从档案选择图片</button><p id="looks-expression-hint"></p>
      <details class="looks-extra-portraits"><summary>未分类图片与默认显示</summary><label>选择已有图片<select id="looks-portrait-choice"></select></label><label>图片表情<select id="looks-emotion"><option value="">未分类</option></select></label><button id="looks-remove-portrait">删除这张图片</button></details></section>
      <section id="looks-sprite-panel" role="tabpanel" hidden><div id="looks-walk-editor"></div></section>
      <section id="looks-action-panel" role="tabpanel" hidden><div class="looks-action-categories" role="group" aria-label="动作分类"><button id="looks-category-object" aria-pressed="true">物品交互</button><button id="looks-category-gesture" aria-pressed="false">小人表情 / 姿态</button></div><p id="looks-category-hint"></p><button id="looks-add-gesture" hidden>＋ 添加小人动作</button><div id="looks-action-cards"></div><div id="looks-action-detail" hidden><button id="looks-action-back" class="looks-text-button">‹ 所有动作</button><h3 id="looks-action-title"></h3><button id="looks-delete-gesture" class="looks-text-button" hidden>删除这个小人动作</button><div id="looks-action-editor"></div></div></section>
      <details class="looks-default"><summary>未上传时的示例形象</summary><select id="looks-skin"><option value="0">棕粉开衫</option><option value="1">苔绿毛衣</option><option value="2">蓝灰外套</option></select></details>
    </section></div><footer class="looks-footer" hidden><button id="looks-save" class="primary">保存修改</button><p id="looks-status" role="status"></p></footer>`;
  document.body.append(box);
  const painting=mountClothingWorkbench({api,report,toast});
  const nameBox=node('dialog');nameBox.id='looks-name-dialog';nameBox.className='world-panel looks-name-dialog';nameBox.innerHTML='<form novalidate><h2 id="looks-name-title"></h2><label>皮肤名称<input id="looks-name-input" maxlength="40" autocomplete="off"></label><fieldset id="looks-create-mode" hidden><legend>制作方式</legend><label><input type="radio" name="skin-create-mode" value="upload" checked>上传图片</label><label><input type="radio" name="skin-create-mode" value="draw">在素体上画衣服</label></fieldset><p id="looks-name-error" role="status"></p><div class="actions"><button type="button" id="looks-name-cancel">取消</button><button type="submit" class="primary">确定</button></div></form>';document.body.append(nameBox);
  const el=id=>document.getElementById(id);
  let people=[],owner='',catalog=null,draft=null,original=null,editingSkin='',view='people',tab='portrait',emotion='neutral',actionId=null,actionCategory='object',generation=0,portraitGeneration=0,portraitImport=0,busy=false,resolveClose;
  const current=()=>box.open&&view==='editor'&&!!draft;
  function message(text=''){el('looks-notice').textContent=view==='editor'?'':text;el('looks-status').textContent=text;}
  function error(e){report(e);message(e.message);}
  const safe=fn=>async(...args)=>{if(busy)return;message();try{await fn(...args);}catch(e){error(e);}};
  const dirty=()=>draft&&fingerprint(draft)!==fingerprint(original);
  const discard=()=>!dirty()||confirm('有尚未保存的修改，放弃这些修改？');
  const changed=()=>message('有未保存的修改');
  function stop(){walk.stop();action.stop();}
  function syncSaveButton(){el('looks-save').disabled=busy||walk.isWorking()||action.isWorking();}
  function show(next){stop();generation++;view=next;box.dataset.view=next;for(const [id,value]of [['looks-people','people'],['looks-wardrobe','skins'],['looks-editor','editor']])el(id).hidden=next!==value;el('looks-tabs').hidden=next!=='editor';box.querySelector('.looks-footer').hidden=next!=='editor';el('looks-back').hidden=next==='people';box.querySelector('.looks-scroll').scrollTop=0;message();}
  function title(){el('looks-title').textContent=view==='people'?'人物形象':view==='skins'?(people.find(p=>p.id===owner)?.name||'人物')+'的衣橱':editingSkin==='default'?'默认皮肤':draft.name;el('looks-subtitle').textContent=view==='editor'?'正在编辑 · '+people.find(p=>p.id===owner)?.name:view==='skins'?'选择使用，或进入编辑':'';}
  async function persist(change){
    busy=true;box.setAttribute('aria-busy','true');
    try{const latest=await api('/character-looks/'+owner),body=change(copy(latest));const result=await api('/character-looks/'+owner,'PATCH',body);catalog=result;await refresh({light:true});return result;}finally{busy=false;box.removeAttribute('aria-busy');syncSaveButton();}
  }
  function askName(text,value='',label='皮肤名称',creation=false){
    el('looks-create-mode').hidden=!creation;nameBox.querySelector('[value=upload]').checked=true;
    nameBox.querySelector('label').firstChild.textContent=label;
    el('looks-name-title').textContent=text;el('looks-name-input').value=value;el('looks-name-error').textContent='';nameBox.showModal();el('looks-name-input').focus();
    return new Promise(resolve=>{let result=null;const close=()=>{nameBox.removeEventListener('close',close);resolve(result);};nameBox.addEventListener('close',close);nameBox.querySelector('form').onsubmit=e=>{e.preventDefault();const name=el('looks-name-input').value.trim();if(!name){el('looks-name-error').textContent='请填写'+label;return;}result=name;nameBox.close();};el('looks-name-input').oninput=()=>{el('looks-name-error').textContent='';};el('looks-name-cancel').onclick=()=>nameBox.close();});
  }
  async function peoplePage(){show('people');draft=null;title();const cards=el('looks-person-cards');cards.replaceChildren();for(const p of people){const b=node('button');b.className='looks-person-card';b.dataset.person=p.id;const avatar=node('span',p.name.slice(0,1));avatar.className='looks-person-avatar';if(p.avatar){const img=node('img');img.src=p.avatar;img.alt='';avatar.replaceChildren(img);}b.append(avatar,node('strong',p.name),node('span','查看皮肤 ›'));b.onclick=safe(()=>wardrobe(p.id));cards.append(b);}}
  async function wardrobe(id=owner){
    show('skins');draft=null;owner=id;box.dataset.owner=id;catalog=null;title();const token=generation;el('looks-skin-cards').replaceChildren(node('p','正在读取皮肤…'));el('looks-add-skin').disabled=true;el('looks-ai-auto').disabled=true;el('looks-ai-setting').hidden=id==='user';
    const result=await api('/character-looks/'+id);if(token!==generation)return;catalog=result;await renderSkins();
  }
  async function renderSkins(){
    const token=generation;el('looks-add-skin').disabled=false;el('looks-ai-auto').disabled=false;el('looks-ai-auto').checked=catalog.auto_skin;const cards=el('looks-skin-cards');cards.replaceChildren();
    for(const s of skinChoices(catalog)){
      const card=node('article');card.className='looks-skin-card';card.dataset.skin=s.id;
      const preview=node('div');preview.className='looks-skin-thumbnails';const image=node('img');image.alt=s.name+'立绘';const canvas=node('canvas');canvas.width=96;canvas.height=128;preview.append(image,canvas);
      const heading=node('div');heading.className='looks-skin-heading';heading.append(node('h3',s.name));if(s.id===catalog.active_skin_id){const badge=node('span','使用中');badge.className='looks-current';heading.append(badge);}
      const controls=node('div');controls.className='looks-card-controls';const use=node('button',s.id===catalog.active_skin_id?'正在使用':'使用'),edit=node('button','编辑');use.disabled=s.id===catalog.active_skin_id;use.onclick=safe(async()=>{await persist(()=>({active_skin_id:s.id}));await renderSkins();toast('已使用'+s.name);});edit.onclick=safe(()=>editSkin(s.id));controls.append(use,edit);
      const paint=node('button',s.drawing?'继续画衣服':'画衣服');paint.className='looks-paint-open';
      paint.onclick=safe(async()=>{
        const id=owner;paint.disabled=true;
        try{await painting.open(id,s.id,(people.find(p=>p.id===id)?.name||'人物')+' · '+s.name);}
        finally{paint.disabled=false;}
        if(box.open&&owner===id){await wardrobe(id);await refresh({light:true});}
      });
      if(s.drawing)controls.append(paint);card.append(preview,heading,controls);
      if(owner!=='user'){const label=node('label','允许 AI 使用');label.className='looks-checkbox';const input=node('input');input.type='checkbox';input.checked=s.ai_allowed!==false;input.dataset.allowed=s.id;label.prepend(input);input.onchange=safe(async()=>{const value=input.checked;try{await persist(c=>s.id==='default'?{ai_allowed:value}:{skins:c.skins.map(k=>k.id===s.id?{...k,ai_allowed:value}:k)});}catch(e){input.checked=!value;throw e;}});card.append(label);}
      if(s.id!=='default'){const more=node('details');more.className='looks-card-more';more.append(node('summary','更多'));const rename=node('button','改名'),remove=node('button','删除皮肤');rename.onclick=safe(async()=>{const name=await askName('修改皮肤名称',s.name);if(!name)return;await persist(c=>({skins:c.skins.map(k=>k.id===s.id?{...k,name}:k)}));await renderSkins();});remove.onclick=safe(async()=>{if(!confirm('删除“'+s.name+'”及其图片？'))return;await persist(c=>({skins:c.skins.filter(k=>k.id!==s.id),active_skin_id:c.active_skin_id===s.id?'default':c.active_skin_id}));await renderSkins();});more.append(rename,remove);card.append(more);}
      cards.append(card);const src=await portraitImage(s,people.find(p=>p.id===owner)?.avatar);if(token!==generation)return;image.src=src;await previewSprite(canvas,s,'down',s.sprite?.idle_frame||0,()=>token===generation);
    }
  }
  async function editSkin(id){const skin=skinChoices(catalog).find(s=>s.id===id);if(!skin)throw Error('皮肤不存在');show('editor');editingSkin=id;box.dataset.skin=id;draft=copy(skin);original=copy(skin);emotion=draft.portraits[draft.portrait]?.emotion||'neutral';actionId=null;actionCategory='object';el('looks-skin').value=draft.skin;box.querySelector('.looks-default').open=false;title();await switchTab('portrait');}
  async function portrait(){
    if(!current())return;const token=generation,portraitToken=++portraitGeneration,selected=draft.portraits.findIndex(p=>p.emotion===emotion),cards=el('looks-expression-cards');cards.replaceChildren();
    const labels=expressionChoices(draft);
    for(const id of draft.portraits.map(p=>p.emotion).filter(Boolean))if(!labels[id])labels[id]=id;
    for(const [id,label]of Object.entries(labels)){const b=node('button'),p=draft.portraits.find(p=>p.emotion===id);b.dataset.emotion=id;b.setAttribute('aria-pressed',String(id===emotion));if(p){b.classList.add('has-image');const img=node('img');img.src=p.image;img.alt='';b.append(img);}else b.append(node('span','＋'));b.append(node('small',label));b.onclick=safe(async()=>{emotion=id;await portrait();});cards.append(b);}
    const src=await portraitImage({...draft,portrait:selected<0?draft.portrait:selected},people.find(p=>p.id===owner)?.avatar);if(token!==generation||portraitToken!==portraitGeneration||!current())return;el('looks-portrait').src=src;el('looks-expression-hint').textContent=selected<0?'为“'+labels[emotion]+'”上传图片':'已配置“'+labels[emotion]+'”，可上传替换';el('looks-delete-expression').hidden=!draft.expressions?.[emotion];
    el('looks-emotion').replaceChildren(new Option('未分类',''),...Object.entries(labels).map(([id,label])=>new Option(label,id)));
    const select=el('looks-portrait-choice');select.replaceChildren();if(!draft.portraits.length)select.append(new Option('尚未上传','0'));draft.portraits.forEach((p,i)=>select.append(new Option(p.name,String(i))));select.value=String(draft.portrait);el('looks-emotion').value=draft.portraits[draft.portrait]?.emotion||'';el('looks-emotion').disabled=!draft.portraits.length;el('looks-remove-portrait').disabled=!draft.portraits.length;
  }
  async function actionCards(){
    action.stop();actionId=null;el('looks-action-detail').hidden=true;el('looks-action-cards').hidden=false;const cards=el('looks-action-cards');cards.replaceChildren();const gesture=actionCategory==='gesture';
    el('looks-add-gesture').hidden=!gesture;el('looks-category-hint').textContent=gesture?'挥手、点头、害羞等小人动作，可自行添加。只表现姿态。':'靠近物品并完成操作时播放；浇水、拉窗帘等各自配置。';
    for(const kind of ['object','gesture'])el('looks-category-'+kind).setAttribute('aria-pressed',String(actionCategory===kind));
    const entries=gesture?Object.entries(draft.gestures||{}).map(([id,g])=>[id,g.name]):Object.entries(ACTIONS);
    if(!entries.length)cards.append(node('p','还没有小人动作，先添加一个，再上传动画。'));
    for(const [id,label]of entries){const b=node('button');b.dataset[gesture?'gesture':'action']=id;b.append(node('strong',label),node('small',(gesture?draft.gestures[id]?.atlas:draft.actions?.[id])?'已配置图集':gesture?'等待上传':'使用基础动作'));b.onclick=safe(()=>openAction(id,label));cards.append(b);}
  }
  async function openAction(id,label){actionId=id;el('looks-action-cards').hidden=true;el('looks-action-detail').hidden=false;el('looks-add-gesture').hidden=true;el('looks-action-title').textContent=label;el('looks-delete-gesture').hidden=actionCategory!=='gesture';await action.refresh();}
  const walk=mountAtlasEditor(el('looks-walk-editor'),{getLook:()=>draft,getAtlas:()=>draft?.sprite,setAtlas:v=>{draft.sprite=v;},readImage,changed,error,working:syncSaveButton,valid:()=>current()&&tab==='sprite'});
  const action=mountAtlasEditor(el('looks-action-editor'),{prefix:'looks-action',action:true,getLook:()=>draft,getAtlas:()=>actionCategory==='gesture'?draft?.gestures?.[actionId]?.atlas:draft?.actions?.[actionId],setAtlas:v=>{if(actionCategory==='gesture'){draft.gestures[actionId].atlas=v;return;}draft.actions={...draft.actions};if(v)draft.actions[actionId]=v;else delete draft.actions[actionId];},readImage,changed,error,working:syncSaveButton,valid:()=>current()&&tab==='action'&&!!actionId&&!el('looks-action-detail').hidden});
  async function switchTab(value){stop();generation++;tab=value;for(const name of ['portrait','sprite','action']){el('looks-tab-'+name).setAttribute('aria-selected',String(tab===name));el('looks-'+name+'-panel').hidden=tab!==name;}message(dirty()?'有未保存的修改':'');box.querySelector('.looks-scroll').scrollTop=0;if(tab==='portrait')await portrait();else if(tab==='sprite')await walk.refresh();else await actionCards();}
  for(const name of ['portrait','sprite','action'])el('looks-tab-'+name).onclick=safe(()=>switchTab(name));
  const resourceId=prefix=>prefix+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,6);
  el('looks-add-expression').onclick=safe(async()=>{if(Object.keys(draft.expressions||{}).length>=16)throw Error('每套皮肤最多添加十六种自定义表情');const name=await askName('添加表情','','表情名称');if(!name||!current())return;emotion=resourceId('expression');draft.expressions={...draft.expressions,[emotion]:name};changed();await portrait();});
  el('looks-delete-expression').onclick=safe(async()=>{if(!confirm('删除该表情及其图片？'))return;delete draft.expressions[emotion];draft.portraits=draft.portraits.filter(p=>p.emotion!==emotion);draft.portrait=0;emotion='neutral';changed();await portrait();});
  for(const kind of ['object','gesture'])el('looks-category-'+kind).onclick=safe(async()=>{generation++;actionCategory=kind;await actionCards();});
  el('looks-add-gesture').onclick=safe(async()=>{if(Object.keys(draft.gestures||{}).length>=16)throw Error('每套皮肤最多十六个小人动作');const name=await askName('添加小人动作','','动作名称');if(!name||!current())return;const id=resourceId('gesture');draft.gestures={...draft.gestures,[id]:{name,atlas:null}};changed();await openAction(id,name);});
  el('looks-delete-gesture').onclick=safe(async()=>{if(!confirm('删除该小人动作及其图集？'))return;delete draft.gestures[actionId];changed();await actionCards();});
  el('looks-action-back').onclick=safe(actionCards);
  el('looks-add-skin').onclick=safe(async()=>{
    if(!catalog)return;const name=await askName('添加皮肤','','皮肤名称',true);if(!name)return;
    const draw=nameBox.querySelector('[name=skin-create-mode]:checked').value==='draw';
    const id='skin_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,6);
    await persist(c=>{if(c.skins.length>=8)throw Error('每个人物最多八套额外皮肤');return {skins:[...c.skins,{id,name,skin:c.skin,portraits:[],portrait:0,sprite:null,actions:{},ai_allowed:!draw}]};});
    if(draw){await painting.open(owner,id,(people.find(p=>p.id===owner)?.name||'人物')+' · '+name);await wardrobe();await refresh({light:true});}
    else await editSkin(id);
  });
  el('looks-ai-auto').onchange=safe(async()=>{const value=el('looks-ai-auto').checked;try{await persist(()=>({auto_skin:value}));}catch(e){el('looks-ai-auto').checked=!value;throw e;}});
  bindCharacterImageInput(el('looks-portrait-file'),{error,guard:()=>{const value=draft,selected=emotion;return ()=>current()&&draft===value&&emotion===selected;},onFile:safe(async file=>{if(!file||!current())return;const token=generation,importToken=++portraitImport,value=draft,selectedEmotion=emotion;const image=await readImage(file);if(token!==generation||importToken!==portraitImport||!current())return;const old=value.portraits.findIndex(p=>p.emotion===selectedEmotion),entry={name:file.name.replace(/\.[^.]+$/,'').slice(0,40),image,emotion:selectedEmotion};if(old<0){if(value.portraits.length>=24)throw Error('每套皮肤最多二十四张，请先移除不用的图片');value.portraits.push(entry);value.portrait=value.portraits.length-1;}else{value.portraits[old]=entry;value.portrait=old;}changed();await portrait();})});
  el('looks-pick-archive').hidden=!pickArchive;
  el('looks-pick-archive').onclick=safe(async()=>{
    const value=draft,selectedEmotion=emotion,id=owner;
    if(dirty())throw Error('请先保存当前修改，再从档案选择图片');
    const asset=await pickArchive(id);if(!asset||!current()||draft!==value||owner!==id||emotion!==selectedEmotion)return;
    // Opening the archive may attach stable references to old portraits.
    catalog=await api('/character-looks/'+id);const latest=skinChoices(catalog).find(s=>s.id===editingSkin);
    draft=copy(latest);original=copy(latest);
    const old=draft.portraits.findIndex(p=>p.emotion===selectedEmotion),entry={name:asset.name,image:asset.image,asset_id:asset.id,emotion:selectedEmotion};
    if(old<0){if(draft.portraits.length>=24)throw Error('每套皮肤最多二十四张图片');draft.portraits.push(entry);draft.portrait=draft.portraits.length-1;}else{draft.portraits[old]=entry;draft.portrait=old;}
    changed();await portrait();
  });
  el('looks-portrait-choice').onchange=safe(async()=>{draft.portrait=Number(el('looks-portrait-choice').value);emotion=draft.portraits[draft.portrait]?.emotion||'neutral';changed();await portrait();});
  el('looks-emotion').onchange=safe(async()=>{const value=el('looks-emotion').value,p=draft.portraits[draft.portrait];if(value&&draft.portraits.some((p,i)=>i!==draft.portrait&&p.emotion===value))throw Error('已有该表情，请选择对应表情后替换图片');if(value)p.emotion=value;else delete p.emotion;emotion=value||'neutral';changed();await portrait();});
  el('looks-remove-portrait').onclick=safe(async()=>{draft.portraits.splice(draft.portrait,1);draft.portrait=0;changed();await portrait();});
  el('looks-skin').onchange=safe(async()=>{draft.skin=Number(el('looks-skin').value);changed();if(tab==='portrait')await portrait();else if(tab==='sprite')await walk.refresh();});
  el('looks-save').onclick=safe(async()=>{if(walk.isWorking()||action.isWorking())throw Error('图片处理中，请稍后保存');const saved=copy(draft),before=copy(original),id=editingSkin;await persist(c=>{const latest=skinChoices(c).find(s=>s.id===id);if(fingerprint(latest)!==fingerprint(before))throw Error('这套皮肤已在别处修改，请返回衣橱重新打开');if(id==='default'){const {id:unused,name,...fields}=saved;return fields;}return {skins:c.skins.map(s=>s.id===id?saved:s)};});draft=copy(skinChoices(catalog).find(s=>s.id===id));original=copy(draft);if(tab==='sprite')await walk.refresh();else if(tab==='action'&&actionId)await action.refresh();message('人物形象已保存');toast('已保存'+saved.name);});
  el('looks-back').onclick=safe(async()=>{if(view==='editor'){if(discard())await wardrobe();}else await peoplePage();});
  function close(){if(!busy&&discard())box.close();}
  el('looks-close').onclick=close;box.addEventListener('cancel',e=>{e.preventDefault();close();});
  box.addEventListener('close',()=>{stop();generation++;draft=null;resolveClose?.();resolveClose=null;});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&box.open)stop();});
  return {async open(id){people=[{id:'user',name:'我'},...await api('/characters')];box.showModal();if(id&&people.some(p=>p.id===id))await wardrobe(id);else await peoplePage();return new Promise(resolve=>{resolveClose=resolve;});}};
}
