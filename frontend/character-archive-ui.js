// SPDX-License-Identifier: AGPL-3.0-only
import {bindCharacterImageInput,readCharacterPicture} from './character-image-input.js';
import {skinChoices,expressionChoices} from './character-looks.js';
const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
const uid=prefix=>prefix+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);
export function installArchiveShell(){
  const entry=node('button');entry.dataset.app='archive';entry.innerHTML='<span class="app-icon archive-icon">▧</span>档案';document.querySelector('.app-grid').append(entry);
  const screen=node('section');screen.id='archive';screen.className='screen archive-page';screen.hidden=true;
  screen.innerHTML=`<header class="archive-heading"><div><button class="icon" data-home aria-label="档案返回桌面">‹</button><h1>档案</h1></div><label>人物<select id="archive-owner" aria-label="档案人物"></select></label><nav role="tablist" aria-label="人物档案">${[['album','相册'],['expressions','表情'],['skins','皮肤与动作']].map(([id,name])=>`<button role="tab" id="archive-tab-${id}" aria-selected="${id==='album'}" aria-controls="archive-content">${name}</button>`).join('')}</nav></header>
    <div class="archive-scroll"><p id="archive-status" role="status"></p><section id="archive-tools"><label class="file-button">＋ 上传图片<input id="archive-file" type="file" accept="image/png,image/jpeg,image/webp"></label><button id="archive-retry" hidden>重试保存图片</button></section><div id="archive-content" role="tabpanel"></div></div>`;
  document.querySelector('.phone').insertBefore(screen,document.getElementById('home-button'));
}
export function mountArchiveUI({api,localReady,isLocal,toast,report,editLooks}){
  const el=id=>document.getElementById(id);
  const detail=node('dialog');detail.id='archive-picture-dialog';detail.className='archive-dialog';
  detail.innerHTML=`<header><h2>图片档案</h2><button id="archive-picture-close" aria-label="关闭图片档案">× 关闭</button></header><div class="archive-detail-scroll"><img id="archive-picture-preview" alt="档案图片"><p id="archive-picture-source"></p><fieldset id="archive-detail-fields"><label>图片名称<input id="archive-picture-name" maxlength="40"></label><button id="archive-rename">保存图片名称</button><hr><h3>用作对话表情</h3><label>所属皮肤<select id="archive-binding-skin"></select></label><label>表情<select id="archive-binding-emotion"></select></label><label id="archive-expression-name-label" hidden>表情名称<input id="archive-expression-name" maxlength="40" placeholder="例如：得意"></label><button id="archive-bind" class="primary">使用这张表情</button><div id="archive-picture-uses"></div><hr><button id="archive-delete">删除图片</button><p id="archive-delete-hint"></p></fieldset></div><footer><p id="archive-picture-status" role="status"></p></footer>`;
  document.body.append(detail);
  const picker=node('dialog');picker.id='archive-picker';picker.className='archive-dialog';picker.innerHTML='<header><h2>从人物档案选择</h2><button aria-label="关闭档案选择">× 关闭</button></header><div class="archive-detail-scroll"><p role="status"></p><div class="archive-gallery"></div></div>';document.body.append(picker);
  let owner='user',people=[],items=[],catalog=null,tab='album',version=0,busy=false,selected=null,pending=null,newExpression='',resolvePick;
  const path=()=>'/character-archive/'+encodeURIComponent(owner);
  const say=text=>{el('archive-status').textContent=text;el('archive-picture-status').textContent=text;};
  function lock(value){busy=value;el('archive-owner').disabled=value;el('archive-detail-fields').disabled=value;el('archive-file').disabled=value;el('archive-retry').disabled=value;for(const button of document.querySelectorAll('#archive [role=tab]'))button.disabled=value;}
  const safe=fn=>async(...args)=>{if(busy)return;lock(true);say('');try{await fn(...args);}catch(error){say(error.message);report(error);}finally{lock(false);}};
  function pictureCard(item,onClick){const card=node('button');card.className='archive-picture-card';card.dataset.asset=item.id;const image=node('img');image.src=item.image;image.alt=item.name;card.append(image,node('strong',item.name),node('small',item.references?.length?'用于 '+item.references.length+' 个表情':'相册图片'));card.onclick=onClick;return card;}
  function currentSkin(){return skinChoices(catalog).find(s=>s.id===el('archive-binding-skin').value);}
  function emotionOptions(){
    const choices=expressionChoices(currentSkin());el('archive-binding-emotion').replaceChildren(...Object.entries(choices).map(([id,name])=>new Option(name,id)),new Option('＋ 添加表情','new'));
    emotionName();
  }
  function emotionName(){const id=el('archive-binding-emotion').value,skin=currentSkin();el('archive-expression-name-label').hidden=id!=='new'&&!skin.expressions?.[id];el('archive-expression-name').value=skin.expressions?.[id]||'';newExpression=uid('expression');}
  async function load(){
    const id=owner,token=version,rows=await api('/character-archive/'+encodeURIComponent(id)),looks=await api('/character-looks/'+encodeURIComponent(id));
    if(id!==owner||token!==version)return false;
    items=rows;catalog=looks;return true;
  }
  function render(){
    for(const id of ['album','expressions','skins'])el('archive-tab-'+id).setAttribute('aria-selected',String(tab===id));
    el('archive-tools').hidden=tab!=='album';const content=el('archive-content');content.replaceChildren();
    if(tab==='skins'){
      content.append(node('p','每套皮肤分别配置表情、小人行走和交互动作。'));
      const button=node('button','打开人物衣橱');button.className='primary';button.onclick=safe(async()=>{await editLooks(owner);await load();render();});content.append(button);return;
    }
    if(tab==='album'){
      if(!items.length){content.append(node('h2','收下这个人物的第一张图片'),node('p','点击上传图片。保存后可命名，或用作世界对话中的表情。'));return;}
      const grid=node('div');grid.className='archive-gallery';for(const item of items)grid.append(pictureCard(item,safe(()=>openPicture(item))));content.append(grid);return;
    }
    content.append(node('p','表情按皮肤使用。点击已有表情可改名或解除使用；新表情从相册图片添加。'));
    for(const skin of skinChoices(catalog)){
      const section=node('section');section.className='archive-expression-section';section.append(node('h2',skin.name+(skin.id===catalog.active_skin_id?' · 使用中':'')));
      const grid=node('div');grid.className='archive-gallery';
      for(const p of skin.portraits.filter(p=>p.emotion)){
        const item=items.find(a=>a.id===p.asset_id);if(!item)continue;
        const card=pictureCard({...item,name:expressionChoices(skin)[p.emotion]||p.name},safe(async()=>{await openPicture(item);el('archive-binding-skin').value=skin.id;emotionOptions();el('archive-binding-emotion').value=p.emotion;emotionName();}));grid.append(card);
      }
      if(!grid.childElementCount)grid.append(node('p','尚未设置表情图片'));
      const add=node('button','＋ 从相册添加表情');add.onclick=safe(()=>{tab='album';render();say('选择一张图片，再设置所属皮肤和表情名称。');});section.append(grid,add);content.append(section);
    }
  }
  async function openPicture(item){
    selected=item;el('archive-picture-preview').src=item.image;el('archive-picture-name').value=item.name;
    el('archive-picture-source').textContent=(item.source.type==='legacy_portrait'?'来源：人物形象':'来源：手动上传'+(item.source.filename?' · '+item.source.filename:''))+'　归档于 '+new Date(item.created_at).toLocaleString();
    el('archive-binding-skin').replaceChildren(...skinChoices(catalog).map(s=>new Option(s.name,s.id)));el('archive-binding-skin').value=catalog.active_skin_id;emotionOptions();
    const uses=el('archive-picture-uses');uses.replaceChildren();
    for(const ref of item.references){const line=node('div');line.className='archive-use';line.append(node('span',ref.skin_name+' · '+(expressionChoices(skinChoices(catalog).find(s=>s.id===ref.skin_id))[ref.emotion]||'未分类')));const remove=node('button','解除使用');remove.onclick=safe(async()=>{await api('/character-looks/'+owner+'/archive-binding','DELETE',{asset_id:item.id,skin_id:ref.skin_id,emotion:ref.emotion});await reloadDetail(item.id);say('已解除使用，图片仍在相册中');});line.append(remove);uses.append(line);}
    el('archive-delete').disabled=!!item.references.length;el('archive-delete-hint').textContent=item.references.length?'删除前先解除上面的表情使用。':'';
    if(!detail.open)detail.showModal();
  }
  async function reloadDetail(id){if(!await load())return;render();const item=items.find(i=>i.id===id);if(item&&detail.open)await openPicture(item);}
  el('archive-binding-skin').onchange=emotionOptions;el('archive-binding-emotion').onchange=emotionName;
  el('archive-rename').onclick=safe(async()=>{const id=selected.id;await api(path()+'/'+id,'PATCH',{name:el('archive-picture-name').value.trim()});await reloadDetail(id);say('图片名称已保存');});
  el('archive-bind').onclick=safe(async()=>{
    const id=selected.id,skin=currentSkin(),choice=el('archive-binding-emotion').value,emotion=choice==='new'?newExpression:choice;
    await api('/character-looks/'+owner+'/archive-binding','POST',{asset_id:id,skin_id:skin.id,emotion,expression_name:el('archive-expression-name').value,expected_asset_id:skin.portraits.find(p=>p.emotion===emotion)?.asset_id||null});
    await reloadDetail(id);say('已用于表情；世界下次显示该表情时会使用这张图。');toast('表情已保存');
  });
  el('archive-delete').onclick=safe(async()=>{if(!confirm('删除这张相册图片？'))return;await api(path()+'/'+selected.id,'DELETE');detail.close();await load();render();say('图片已删除');});
  el('archive-picture-close').onclick=()=>{if(!busy)detail.close();};detail.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  async function savePending(){await api('/character-archive/'+pending.owner,'POST',pending.body);pending=null;el('archive-retry').hidden=true;await load();render();say('图片已保存。点击图片可命名或设为表情。');}
  el('archive-retry').onclick=safe(savePending);
  bindCharacterImageInput(el('archive-file'),{error:e=>{say(e.message);report(e);},guard:()=>{const token=version,id=owner;return ()=>token===version&&id===owner&&!el('archive').hidden;},onFile:safe(async file=>{
    const token=version,id=owner,image=await readCharacterPicture(file);if(token!==version||id!==owner||el('archive').hidden)return;
    pending={owner:id,body:{id:uid('picture'),name:file.name.replace(/\.[^.]+$/,'').slice(0,40)||'图片',filename:file.name.slice(0,160),image}};el('archive-retry').hidden=false;await savePending();
  })});
  el('archive-owner').onchange=safe(async()=>{owner=el('archive-owner').value;version++;pending=null;el('archive-retry').hidden=true;await load();render();});
  for(const id of ['album','expressions','skins'])el('archive-tab-'+id).onclick=safe(()=>{tab=id;render();});
  picker.querySelector('header button').onclick=()=>picker.close();picker.addEventListener('close',()=>{resolvePick?.(null);resolvePick=null;});
  return {
    async refresh(){
      const token=++version;await localReady;if(!isLocal()){el('archive-content').replaceChildren(node('p','档案目前支持本机模式，请在设置中切回本机。'));el('archive-tools').hidden=true;return;}
      people=[{id:'user',name:'我'},...await api('/characters')];if(token!==version)return;
      if(!people.some(p=>p.id===owner))owner='user';el('archive-owner').replaceChildren(...people.map(p=>new Option(p.name,p.id)));el('archive-owner').value=owner;
      await load();if(token===version)render();
    },
    leave(){version++;},
    async pick(id){
      const rows=await api('/character-archive/'+encodeURIComponent(id));const grid=picker.querySelector('.archive-gallery');grid.replaceChildren();picker.querySelector('p').textContent=rows.length?'选择用于当前表情的图片。':'这个人物还没有档案图片，请先在桌面“档案”上传。';
      for(const item of rows)grid.append(pictureCard(item,()=>{const resolve=resolvePick;resolvePick=null;picker.close();resolve?.(item);}));picker.showModal();return new Promise(resolve=>{resolvePick=resolve;});
    }
  };
}
