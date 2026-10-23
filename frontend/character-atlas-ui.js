// SPDX-License-Identifier: AGPL-3.0-only
// Shared image editor; callers own the selected skin, draft and persistence.
import {previewSprite} from './world-art.js';
import {atlasMeta,validateAtlas,DIRECTIONS} from './character-looks.js';
export function mountAtlasEditor(root,{prefix='looks',action=false,getLook,getAtlas,setAtlas,readImage,changed,error,valid}){
  const id=n=>prefix+'-'+n,el=n=>root.querySelector('#'+id(n));
  root.innerHTML=`<label>导入格式<select id="${id('import-layout')}"><option value="three">三列四行 · 迈腿 / 站立 / 迈腿</option><option value="legacy">四列四行 · 站立开始</option><option value="action">单行 · 动作序列</option><option value="custom">自定义布局 / 保留原设置</option></select></label><p class="looks-sheet-help">${action?'可上传单行动画，也可使用四方向图集。':'下、左、右、上各一行。中间站立，左右两格分别迈腿；每格大小一致，脚底对齐。'}</p><label class="file-button">${action?'上传 / 替换动作图集':'上传 / 替换行走图集'}<input id="${id('sprite-file')}" type="file" accept="image/png"></label><p id="${id('sprite-name')}"></p><div class="looks-sheet-grid" aria-label="四方向切帧表"></div><p id="${id('sheet-size')}"></p><div class="looks-animation-preview"><canvas id="${id('sprite')}" width="192" height="192" aria-label="${action?'动作':'行走'}预览"></canvas><div><button id="${id('preview-play')}" aria-pressed="false">${action?'播放动作':'播放行走'}</button><p id="${id('pose')}" role="status"></p></div></div>
    <label class="looks-direction-picker">预览方向<select id="${id('direction')}"><option value="down">正面</option><option value="left">向左</option><option value="right">向右</option><option value="up">背面</option></select></label>
    <details class="looks-atlas-settings"><summary>调整图集 · 方向与帧</summary><label>图集模板<select id="${id('atlas-preset')}"><option value="legacy">四帧 · 下 / 左 / 右 / 上</option><option value="rpg">四帧 · 下 / 右 / 上 / 左</option><option value="three">三帧 · 中间站立</option><option value="action">单行交互动作</option></select></label>
    <div class="looks-field-pair"><label>每行几帧<input id="${id('frames')}" type="number" min="1" max="8" value="4"></label><label>整图几行<input id="${id('row-count')}" type="number" min="1" max="16" value="${action?1:4}"></label></div>
    <div class="looks-field-pair">${DIRECTIONS.map((d,i)=>`<label>${['正面','向左','向右','背面'][i]}用第几行<input id="${id('row-'+d)}" type="number" min="1" max="16" value="${action?1:i+1}"></label>`).join('')}</div>
    <label>站立用第几帧<input id="${id('idle-frame')}" type="number" min="1" max="8" value="1"></label><label>${action?'动作':'行走'}播放顺序<input id="${id('walk-order')}" value="1,2,3,4"></label><button id="${id('apply-atlas')}">应用方向与帧设置</button><p>每行、每帧从 1 开始。三帧图可选第 2 帧站立，按 2,1,2,3 播放。</p></details>
    <div class="looks-frame-strip" aria-label="图集帧预览"></div><button id="${id('reset-sprite')}" class="looks-text-button">${action?'移除专用动作图':'恢复默认小人'}</button>`;
  let timer=null,frame=0,playing=false,generation=0,selectedFrame=null;
  const safe=fn=>async(...args)=>{try{await fn(...args);}catch(e){error(e);}};
  const order=m=>m.order;
  function stop(){clearInterval(timer);timer=null;playing=false;frame=0;generation++;el('preview-play').textContent=action?'播放动作':'播放行走';el('preview-play').setAttribute('aria-pressed','false');}
  function inputs(){const value={frames:Number(el('frames').value),row_count:Number(el('row-count').value),idle_frame:Number(el('idle-frame').value)-1,walk_order:el('walk-order').value.split(',').map(n=>Number(n.trim())-1),rows:Object.fromEntries(DIRECTIONS.map(d=>[d,Number(el('row-'+d).value)-1]))};validateAtlas({...value,image:'data:image/png;base64,AAAA'});return value;}
  function load(){selectedFrame=null;const sprite=getAtlas(),m=atlasMeta(sprite||(action?{frames:4,row_count:1}:{frames:3,idle_frame:1}));const standard=m.rowCount===4&&DIRECTIONS.every((d,i)=>m.rows[d]===i);el('import-layout').value=!sprite?(action?'action':'three'):standard&&m.frames===3&&m.idle===1?'three':standard&&m.frames===4&&m.idle===0?'legacy':m.rowCount===1?'action':'custom';el('frames').value=m.frames;el('row-count').value=m.rowCount;el('idle-frame').value=m.idle+1;el('walk-order').value=m.order.map(i=>i+1).join(',');for(const d of DIRECTIONS)el('row-'+d).value=m.rows[d]+1;}
  async function draw(){
    if(!valid())return;const token=generation,sprite=getAtlas(),m=atlasMeta(sprite),selected=playing?order(m)[frame%order(m).length]:selectedFrame??m.idle;
    await previewSprite(el('sprite'),{...getLook(),sprite},el('direction').value,selected,()=>token===generation&&valid());
    if(token!==generation||!valid())return;
    el('pose').textContent=(playing?(action?'播放中':selected===m.idle?'站立':'播放中'):action?'预览停止':selected===m.idle?'站立':'选中姿势')+' · 第 '+(selected+1)+' 帧';
    el('sprite-name').textContent=sprite?'已上传图集 · 点击格子检查朝向和姿势':action?'尚未上传动作图':'尚未上传 · 房间继续使用默认小人';
  }
  async function strip(){
    const token=generation,container=root.querySelector('.looks-frame-strip'),sprite=getAtlas(),m=atlasMeta(sprite);container.replaceChildren();
    for(const i of order(m)){const card=document.createElement('figure'),c=document.createElement('canvas'),caption=document.createElement('figcaption');c.width=96;c.height=96;caption.textContent='第 '+(i+1)+' 帧'+(!action&&i===m.idle?' · 站立':'');card.append(c,caption);container.append(card);await previewSprite(c,{...getLook(),sprite},el('direction').value,i,()=>token===generation&&valid());if(token!==generation||!valid())return;}
  }
  async function sheet(){
    const token=generation,sprite=getAtlas(),m=atlasMeta(sprite||{...inputs()}),grid=root.querySelector('.looks-sheet-grid');
    grid.replaceChildren();grid.style.gridTemplateColumns='34px repeat('+m.frames+',minmax(0,1fr))';grid.append(document.createElement('span'));
    for(let f=0;f<m.frames;f++){const h=document.createElement('small');h.textContent=f===m.idle?'站立':m.frames===3?(f===0?'迈腿 A':'迈腿 B'):'第 '+(f+1)+' 帧';grid.append(h);}
    for(const direction of action&&m.rowCount===1?['down']:DIRECTIONS){
      const label=document.createElement('strong');label.textContent={down:'向下',left:'向左',right:'向右',up:'向上'}[direction];grid.append(label);
      for(let f=0;f<m.frames;f++){
        const b=document.createElement('button'),c=document.createElement('canvas');c.width=72;c.height=80;b.type='button';b.dataset.direction=direction;b.dataset.frame=f;b.setAttribute('aria-label',label.textContent+' · '+(f===m.idle?'站立':'第 '+(f+1)+' 帧'));b.classList.toggle('idle-frame',f===m.idle);b.append(c);grid.append(b);
        b.onclick=safe(async()=>{stop();el('direction').value=direction;selectedFrame=f;await draw();grid.querySelectorAll('button').forEach(n=>n.setAttribute('aria-pressed',String(n===b)));});
        if(sprite)await previewSprite(c,{...getLook(),sprite},direction,f,()=>token===generation&&valid());
        else{const x=c.getContext('2d');x.fillStyle='#a88b71';x.font='13px sans-serif';x.textAlign='center';x.fillText(f===m.idle?'站立':'迈腿',36,45);}
        if(token!==generation||!valid())return;
      }
    }
    el('sheet-size').textContent='';
    if(sprite){const img=new Image();img.onload=()=>{if(token===generation&&valid())el('sheet-size').textContent=img.width+' × '+img.height+' px · 每格 '+(img.width/m.frames)+' × '+(img.height/m.rowCount)+' px';};img.src=sprite.image;}
  }
  async function refresh(){stop();load();await draw();if(valid()){await sheet();await strip();}}
  el('preview-play').onclick=safe(async()=>{if(playing){stop();selectedFrame=null;await draw();return;}selectedFrame=null;playing=true;el('preview-play').textContent=action?'停止动作':'停止 · 回到站立';el('preview-play').setAttribute('aria-pressed','true');await draw();timer=setInterval(()=>{frame++;draw().catch(e=>{stop();error(e);});},120);});
  el('direction').onchange=safe(async()=>{stop();await draw();await strip();});
  function preset(p){el('frames').value=p==='three'?3:4;el('row-count').value=p==='action'?1:4;el('idle-frame').value=p==='three'?2:1;el('walk-order').value=p==='three'?'2,1,2,3':'1,2,3,4';const rows=p==='rpg'?{down:1,right:2,up:3,left:4}:{down:1,left:2,right:3,up:4};for(const d of DIRECTIONS)el('row-'+d).value=p==='action'?1:rows[d];}
  el('atlas-preset').onchange=()=>preset(el('atlas-preset').value);
  el('import-layout').onchange=safe(async()=>{const value=el('import-layout').value;if(value!=='custom'){preset(value);if(!getAtlas())await sheet();}if(getAtlas())el('sprite-name').textContent='下次上传按新格式切分；当前图片保持原布局。';});
  el('apply-atlas').onclick=safe(async()=>{const atlas=getAtlas();if(!atlas)throw Error('先按填写的布局上传图集');const meta=inputs(),token=generation,img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('图集无法解码'));i.src=atlas.image;});if(token!==generation||!valid())return;if(img.width%meta.frames||img.height%meta.row_count)throw Error('图集尺寸不能按当前行列均分');setAtlas({...atlas,...meta});changed();await refresh();});
  el('sprite-file').onchange=safe(async e=>{const file=e.target.files[0];if(!file||!valid())return;const meta=inputs(),token=++generation;e.target.value='';const image=await readImage(file,{sprite:true,...meta});if(token!==generation||!valid())return;setAtlas({image,...meta});changed();await refresh();});
  el('reset-sprite').onclick=safe(async()=>{setAtlas(null);changed();await refresh();});
  return {refresh,stop,draw};
}
