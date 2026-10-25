// SPDX-License-Identifier: AGPL-3.0-only
// Shared image editor; callers own the selected skin, draft and persistence.
import {previewSprite,loadArtImage} from './world-art.js';
import {atlasMeta,validateAtlas,DIRECTIONS} from './character-looks.js';
import {frameKey,initializeFrames,replaceFrame,removeFrame,drawFrameGuide,fallbackFrame,editableFrame} from './character-frame-editor.js';
import {bindCharacterImageInput} from './character-image-input.js';
import {mountCalibration} from './character-calibration-ui.js';
export function mountAtlasEditor(root,{prefix='looks',action=false,getLook,getAtlas,setAtlas,readImage,changed,error,valid,working=()=>{}}){
  const id=n=>prefix+'-'+n,el=n=>root.querySelector('#'+id(n));
  root.innerHTML=`<label>导入格式<select id="${id('import-layout')}"><option value="three">三列四行 · 迈腿 / 站立 / 迈腿</option><option value="legacy">四列四行 · 站立开始</option><option value="action">单行 · 动作序列</option><option value="custom">自定义布局 / 保留原设置</option></select></label><p class="looks-sheet-help">${action?'可上传单行动画，也可使用四方向图集。':'下、左、右、上各一行。中间站立，左右两格分别迈腿；每格大小一致，脚底对齐。'}</p><label class="file-button">${action?'上传 / 替换动作图集':'上传 / 替换行走图集'}<input id="${id('sprite-file')}" type="file" accept="image/png"></label><p id="${id('sprite-name')}"></p><div class="looks-sheet-grid" aria-label="四方向切帧表"></div><p id="${id('sheet-size')}"></p><div class="looks-animation-preview"><canvas id="${id('sprite')}" width="192" height="192" aria-label="${action?'动作':'行走'}预览"></canvas><div><button id="${id('preview-play')}" aria-pressed="false">${action?'播放动作':'播放行走'}</button><p id="${id('pose')}" role="status"></p></div></div>
    <div class="looks-atlas-settings" hidden>
    <div class="looks-field-pair"><label>每行几帧<input id="${id('frames')}" type="number" min="1" max="8" value="4"></label><label>整图几行<input id="${id('row-count')}" type="number" min="1" max="16" value="${action?1:4}"></label></div>
    <div class="looks-field-pair">${DIRECTIONS.map((d,i)=>`<label>${['正面','向左','向右','背面'][i]}用第几行<input id="${id('row-'+d)}" type="number" min="1" max="16" value="${action?1:i+1}"></label>`).join('')}</div>
    <label>站立用第几帧<input id="${id('idle-frame')}" type="number" min="1" max="8" value="1"></label><label>${action?'动作':'行走'}播放顺序<input id="${id('walk-order')}" value="1,2,3,4"></label><button id="${id('apply-atlas')}">应用方向与帧设置</button><p>每行、每帧从 1 开始。三帧图可选第 2 帧站立，按 2,1,2,3 播放。</p></div>
    <div class="looks-frame-strip" aria-label="图集帧预览"></div><button id="${id('reset-sprite')}" class="looks-text-button">${action?'移除专用动作图':'恢复默认小人'}</button>`;
  const advanced=document.createElement('dialog');advanced.className='world-panel looks-import-advanced looks-import-dialog';
  advanced.innerHTML='<header><h2>导入整张图</h2><button type="button" aria-label="关闭导入">关闭</button></header>';
  advanced.querySelector('button').onclick=()=>advanced.close();
  const importOpen=document.createElement('button');importOpen.type='button';importOpen.className='looks-import-open';importOpen.textContent='导入整张图';importOpen.onclick=()=>advanced.showModal();
  const settings=root.querySelector('.looks-atlas-settings');
  for(const element of [el('import-layout').closest('label'),el('sprite-file').closest('label'),settings,el('reset-sprite')])advanced.append(element);
  root.append(importOpen,advanced);root.querySelector('.looks-frame-strip').remove();
  const single=document.createElement('div');single.className='looks-selected-upload';single.innerHTML=`<strong id="${id('selected-frame')}"></strong><label class="file-button">上传 / 替换这一格<input id="${id('frame-file')}" type="file" accept="image/png"></label>`;root.prepend(single);
  single.after(importOpen);
  const adjust=document.createElement('div');adjust.id=id('frame-adjustments');adjust.className='looks-frame-adjustments';adjust.hidden=true;adjust.innerHTML=`<p>中心与脚底用绿线标出，迈腿时可对照半透明站立图。调整只影响这一格。</p><label>大小 <output id="${id('scale-value')}"></output><input id="${id('frame-scale')}" type="text" inputmode="numeric" aria-label="这一帧的大小百分比"></label><div class="looks-field-pair"><label>左右位置（像素）<input id="${id('frame-x')}" type="number" step="1"></label><label>上下位置（像素）<input id="${id('frame-y')}" type="number" step="1"></label></div><div class="looks-resource-tools"><button id="${id('align-reset')}">重置对齐</button><button id="${id('frame-remove')}">还原这一格</button></div>`;root.querySelector('.looks-animation-preview').after(adjust);
  root.querySelector('.looks-sheet-help').textContent='选中一格，再上传这个姿势的单张透明 PNG；未替换的格子保留原图。';
  let timer=null,frame=0,playing=false,generation=0,selectedFrame=null,pending=0,calibration,direction='down',sheetImage=null,sheetLayout='';
  const safe=fn=>async(...args)=>{try{await fn(...args);}catch(e){error(e);}};
  const order=m=>m.order;
  function stop(){clearInterval(timer);timer=null;playing=false;frame=0;generation++;calibration?.cancel();el('preview-play').textContent=action?'播放动作':'播放行走';el('preview-play').setAttribute('aria-pressed','false');}
  function inputs(){const value={frames:Number(el('frames').value),row_count:Number(el('row-count').value),idle_frame:Number(el('idle-frame').value)-1,walk_order:el('walk-order').value.split(',').map(n=>Number(n.trim())-1),rows:Object.fromEntries(DIRECTIONS.map(d=>[d,Number(el('row-'+d).value)-1]))};validateAtlas({...value,image:'data:image/png;base64,AAAA'});return value;}
  const meta=()=>atlasMeta(getAtlas()||inputs());
  const key=()=>frameKey(getAtlas()||inputs(),direction,selectedFrame??meta().idle);
  const capture=()=>{const look=getLook(),slot=key();return ()=>valid()&&getLook()===look&&key()===slot;};
  function selection(){
    const m=meta(),f=selectedFrame??m.idle,d=direction,e=getAtlas()?.frame_editor,stored=e?.cells[key()],cell=stored||{scale:e?.scale||1,x:0,y:0};
    el('selected-frame').textContent={down:'向下',left:'向左',right:'向右',up:'向上'}[d]+' · '+(action?'第 '+(f+1)+' 帧':f===m.idle?'站立':m.frames===3?(f===0?'迈腿 A':'迈腿 B'):'第 '+(f+1)+' 帧');
    root.querySelectorAll('.looks-sheet-grid button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.direction===d&&+b.dataset.frame===f)));
    adjust.hidden=!getAtlas();
    el('frame-scale').value=Math.round(cell.scale/(e?.scale||1)*100);el('scale-value').textContent=el('frame-scale').value+'%';el('frame-x').value=cell.x;el('frame-y').value=cell.y;
    el('align-reset').disabled=!stored;el('frame-remove').disabled=!stored;
    for(const n of ['frame-x','frame-y']){if(e){el(n).min=-(n==='frame-x'?e.width:e.height);el(n).max=n==='frame-x'?e.width:e.height;}else{el(n).removeAttribute('min');el(n).removeAttribute('max');}}
  }
  function load(){selectedFrame=null;const sprite=getAtlas(),m=atlasMeta(sprite||(action?{frames:4,row_count:1}:{frames:3,idle_frame:1}));const standard=m.rowCount===4&&DIRECTIONS.every((d,i)=>m.rows[d]===i);el('import-layout').value=!sprite?(action?'action':'three'):standard&&m.frames===3&&m.idle===1?'three':standard&&m.frames===4&&m.idle===0?'legacy':m.rowCount===1?'action':'custom';el('frames').value=m.frames;el('row-count').value=m.rowCount;el('idle-frame').value=m.idle+1;el('walk-order').value=m.order.map(i=>i+1).join(',');for(const d of DIRECTIONS)el('row-'+d).value=m.rows[d]+1;settings.hidden=el('import-layout').value!=='custom';}
  async function draw(){
    if(!valid())return;const token=generation,sprite=getAtlas(),m=meta(),selected=playing?order(m)[frame%order(m).length]:selectedFrame??m.idle;
    if(sprite)await drawFrameGuide(el('sprite'),sprite,direction,selected,getLook(),()=>token===generation&&valid(),calibration?.guides()??true,!playing);else await previewSprite(el('sprite'),getLook(),direction,fallbackFrame(getLook(),m,selected,action),()=>token===generation&&valid());
    if(token!==generation||!valid())return;
    el('pose').textContent=(playing?(action?'播放中':selected===m.idle?'站立':'播放中'):action?'预览停止':selected===m.idle?'站立':'选中姿势')+' · 第 '+(selected+1)+' 帧';
    el('sprite-name').textContent=sprite?.frame_editor?'已替换 '+Object.keys(sprite.frame_editor.cells).length+' 格 · 其他格保留原图':sprite?'已上传图集 · 点击格子检查朝向和姿势':action?'尚未上传动作图':'尚未上传 · 房间继续使用默认小人';
    await calibration?.drawRoom(playing?frame*2/m.order.length:null);
  }
  async function sheet(){
    const token=generation,sprite=getAtlas(),m=atlasMeta(sprite||{...inputs()}),grid=root.querySelector('.looks-sheet-grid');
    const layout=JSON.stringify(m);if(sheetImage===(sprite?.image||null)&&sheetLayout===layout){selection();return;}sheetImage=null;sheetLayout='';
    grid.replaceChildren();grid.style.gridTemplateColumns='34px repeat('+m.frames+',minmax(0,1fr))';grid.append(document.createElement('span'));
    for(let f=0;f<m.frames;f++){const h=document.createElement('small');h.textContent=action?'第 '+(f+1)+' 帧':f===m.idle?'站立':m.frames===3?(f===0?'迈腿 A':'迈腿 B'):'第 '+(f+1)+' 帧';grid.append(h);}
    for(const rowDirection of action&&m.rowCount===1?['down']:DIRECTIONS){
      const label=document.createElement('strong');label.textContent={down:'向下',left:'向左',right:'向右',up:'向上'}[rowDirection];grid.append(label);
      for(let f=0;f<m.frames;f++){
        const b=document.createElement('button'),c=document.createElement('canvas');c.width=72;c.height=80;b.type='button';b.dataset.direction=rowDirection;b.dataset.frame=f;b.setAttribute('aria-label',label.textContent+' · '+(f===m.idle?'站立':'第 '+(f+1)+' 帧'));b.classList.toggle('idle-frame',!action&&f===m.idle);b.append(c);grid.append(b);
        b.onclick=safe(async()=>{stop();direction=rowDirection;selectedFrame=f;selection();await draw();await calibration.refresh();});
        if(sprite)await previewSprite(c,{...getLook(),sprite},rowDirection,f,()=>token===generation&&valid());
        else{const x=c.getContext('2d');x.fillStyle='#a88b71';x.font='13px sans-serif';x.textAlign='center';x.fillText(action?'第 '+(f+1)+' 帧':f===m.idle?'站立':'迈腿',36,45);}
        if(token!==generation||!valid())return;
      }
    }
    selection();el('sheet-size').textContent='';
    if(sprite){const img=await loadArtImage(sprite.image);if(token===generation&&valid())el('sheet-size').textContent=img.width+' × '+img.height+' px · 每格 '+(img.width/m.frames)+' × '+(img.height/m.rowCount)+' px';}
    if(token===generation&&valid()){sheetImage=sprite?.image||null;sheetLayout=layout;}
  }
  async function refresh(){stop();const selected=selectedFrame;load();selectedFrame=selected!==null&&selected<meta().frames?selected:meta().idle;await draw();if(valid())await sheet();if(valid())await calibration?.refresh();}
  el('preview-play').onclick=safe(async()=>{if(playing){stop();selectedFrame=meta().idle;selection();await draw();return;}playing=true;el('preview-play').textContent=action?'停止动作':'停止 · 回到站立';el('preview-play').setAttribute('aria-pressed','true');await draw();timer=setInterval(()=>{frame++;draw().catch(e=>{stop();error(e);});},120);});
  function preset(p){el('frames').value=p==='three'?3:4;el('row-count').value=p==='action'?1:4;el('idle-frame').value=p==='three'?2:1;el('walk-order').value=p==='three'?'2,1,2,3':'1,2,3,4';const rows=p==='rpg'?{down:1,right:2,up:3,left:4}:{down:1,left:2,right:3,up:4};for(const d of DIRECTIONS)el('row-'+d).value=p==='action'?1:rows[d];}
  el('import-layout').onchange=safe(async()=>{const value=el('import-layout').value;settings.hidden=value!=='custom';if(value!=='custom'){preset(value);if(!getAtlas())await sheet();}if(getAtlas())el('sprite-name').textContent='下次上传按新格式切分；当前图片保持原布局。';});
  el('apply-atlas').onclick=safe(async()=>{const atlas=getAtlas();if(!atlas)throw Error('先按填写的布局上传图集');if(atlas.frame_editor&&!confirm('重新切分会清除单格编辑记录，保留当前合成图片，继续？'))return;const meta=inputs(),token=generation,img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('图集无法解码'));i.src=atlas.image;});if(token!==generation||!valid())return;if(img.width%meta.frames||img.height%meta.row_count)throw Error('图集尺寸不能按当前行列均分');setAtlas({image:atlas.image,...meta});changed();advanced.close();await refresh();});
  bindCharacterImageInput(el('sprite-file'),{error,guard:capture,onFile:async file=>{if(!valid())return;if(getAtlas()?.frame_editor&&!confirm('替换整张图集会移除当前的单格编辑，继续？'))return;const meta=inputs();await mutate(async()=>({image:await readImage(file,{sprite:true,...meta}),...meta}),{resetSelection:true});}});
  async function mutate(change,{resetSelection=false}={}){if(!valid())return;stop();const token=generation,look=getLook();pending++;working();root.setAttribute('aria-busy','true');try{const next=await change();if(token!==generation||!valid()||getLook()!==look)return;setAtlas(next);if(resetSelection)selectedFrame=null;changed();advanced.close();await refresh();}finally{pending--;root.setAttribute('aria-busy',String(pending>0));working();}}
  bindCharacterImageInput(el('frame-file'),{error,guard:capture,onFile:async file=>{if(!valid())return;const slot=key(),old=getAtlas(),look=getLook(),m=meta(),layout={frames:m.frames,row_count:m.rowCount,rows:m.rows,idle_frame:m.idle,walk_order:m.order};await mutate(async()=>{const image=await readImage(file,{sprite:true,frames:1,row_count:1}),atlas=await initializeFrames(old,look,layout,image,action);return replaceFrame(atlas,slot,image);});}});
  async function align(){
    const atlas=getAtlas();if(!atlas)return;const slot=key(),x=Number(el('frame-x').value),y=Number(el('frame-y').value),scale=(atlas.frame_editor?.scale||1)*Number(el('frame-scale').value)/100;
    if(!Number.isInteger(x)||!Number.isInteger(y)||!Number.isFinite(scale)||scale<=0||scale>16)throw Error('位置需要填写整数，大小需要在有效范围内');
    await mutate(async()=>{const draft=await editableFrame(atlas,slot),e=draft.frame_editor;if(Math.abs(x)>e.width||Math.abs(y)>e.height)throw Error('位置需要在当前格子的宽高范围内');return replaceFrame(draft,slot,null,{x,y,scale});});
  }
  for(const n of ['frame-scale','frame-x','frame-y'])el(n).onchange=safe(align);
  el('frame-scale').oninput=()=>{el('scale-value').textContent=el('frame-scale').value+'%';};
  el('align-reset').onclick=safe(()=>{const a=getAtlas();return mutate(()=>replaceFrame(a,key(),null,{x:0,y:0,scale:a.frame_editor.scale}));});
  el('frame-remove').onclick=safe(()=>{const a=getAtlas(),slot=key();return mutate(()=>removeFrame(a,slot));});
  el('reset-sprite').onclick=safe(async()=>{setAtlas(null);changed();advanced.close();await refresh();});
  calibration=mountCalibration(root,{prefix,canvas:el('sprite'),getAtlas,getLook,key,direction:()=>direction,valid,error,draw,commit:next=>mutate(async()=>next),move:(dx,dy)=>{const atlas=getAtlas(),slot=key();return mutate(async()=>{const a=await editableFrame(atlas,slot),e=a.frame_editor,cell=e.cells[slot];return replaceFrame(a,slot,null,{x:Math.max(-e.width,Math.min(e.width,cell.x+dx)),y:Math.max(-e.height,Math.min(e.height,cell.y+dy))});});}});
  adjust.querySelector('p').textContent='仅修正这一帧；以固定素体和半透明站立姿势对照。';
  el('frame-scale').closest('label').firstChild.textContent='这一帧的大小 ';
  return {refresh,stop,draw,isWorking:()=>pending>0};
}
