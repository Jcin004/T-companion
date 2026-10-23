// SPDX-License-Identifier: AGPL-3.0-only
// Kept outside page navigation so leaving Settings never resets an active transfer.
export function updateError(message='') {
  if(/unable to resolve host|unknownhost|name.*not resolved|dns/i.test(message))return '无法解析更新服务器地址，请检查手机网络或 DNS；本次未完成更新检查。';
  if(/timeout|timed out/i.test(message))return '连接更新服务器超时，请稍后重试；本次未完成更新检查。';
  if(/ssl|certificate|handshake/i.test(message))return '更新服务器的安全连接验证失败，请检查网络和系统时间。';
  return message||'更新失败，请重试';
}
export function normalizeUpdateSources(text='') {
  const values=text.split(/\r?\n/).map(value=>value.trim()).filter(Boolean);
  if(values.length>3)throw Error('最多填写 3 个 HTTPS 更新清单地址');
  return [...new Set(values.map(value=>{
    let url;try{url=new URL(value);}catch{throw Error('请填写完整的 HTTPS 更新清单地址');}
    if(value.length>2048||url.protocol!=='https:'||!url.hostname||url.username||url.password||value.includes('?')||value.includes('#'))throw Error('更新清单须为 HTTPS 地址，且不能包含账号、访问密钥或查询参数');
    return url.href;
  }))];
}
// Each native plugin has one task owner across all Settings mounts.
const sessions = new WeakMap();
function sessionFor(plugin) {
  if (sessions.has(plugin)) return sessions.get(plugin);
  const state = {phase:'check', manifest:null, locked:true, channelPublished:true,
    message:'正在读取更新状态…', sources:[], configurable:false, bytes:0, total:0,
    progressPhase:'', speed:0, lastBytes:0, lastTime:0, views:new Set()};
  state.emit = () => { for (const paint of state.views) paint(); };
  sessions.set(plugin,state);
  Promise.resolve(plugin.addListener('progress',event => {
    if (!Number.isFinite(event.bytes) || !(event.total > 0)) return;
    const now = performance.now();
    if (state.lastTime && event.bytes >= state.lastBytes && now > state.lastTime)
      state.speed = (event.bytes-state.lastBytes)*1000/(now-state.lastTime);
    state.bytes = Math.max(0,Math.min(event.total,event.bytes)); state.total = event.total;
    state.lastBytes = state.bytes; state.lastTime = now;
    state.progressPhase = event.phase || 'downloading'; state.emit();
  })).catch(()=>{});
  plugin.info().then(info => {
    state.channelPublished = info.channelPublished !== false;
    state.sources = info.manifestSources || []; state.configurable = info.configurableChannel === true;
    state.message = state.channelPublished ? '' : '当前为私有手动更新，在线渠道尚未发布。收到新版 APK 后直接覆盖安装；不要卸载旧版。';
    if (info.ready) {
      state.manifest=info.ready; state.phase='ready'; state.message='已恢复校验通过的安装包，可继续安装。';
    } else if (info.resumable) {
      state.manifest=info.resumable; state.phase='available';
      state.bytes=info.downloadedBytes || 0; state.total=info.resumable.sizeBytes;
      state.message='已恢复未完成的下载，点击继续下载。';
    }
  }).catch(error=>{state.message=updateError(error.message);}).finally(()=>{state.locked=false;state.emit();});
  return state;
}
export function mountAppUpdate(container, plugin, isBusy=()=>false, record=()=>{}) {
  const button=document.createElement('button'), message=document.createElement('p'), notes=document.createElement('p'), progress=document.createElement('progress'), pause=document.createElement('button');
  message.style.whiteSpace='pre-line'; message.setAttribute('role','status');
  button.type='button'; button.id='check-update'; button.textContent='检查更新';
  progress.max=1; progress.hidden=true; pause.type='button'; pause.textContent='暂停下载'; pause.hidden=true; pause.id='pause-update';
  container.append(button,pause,progress,message,notes);
  const manual=document.createElement('a'); manual.href='https://github.com/Jcin004/T-companion-updates/releases'; manual.target='_blank'; manual.rel='noopener noreferrer'; manual.textContent='在浏览器打开下载页，手动覆盖安装'; container.append(manual);
  if (!plugin) {button.disabled=true;button.textContent='在线更新未启用';message.textContent='浏览器不能安装 APK 更新。请在 Android 应用内检查更新，或从公开下载渠道获取安装包。';return;}
  const state=sessionFor(plugin);
  const channels=document.createElement('details'), summary=document.createElement('summary'), form=document.createElement('form'), label=document.createElement('label'), sources=document.createElement('textarea'), help=document.createElement('small'), save=document.createElement('button');
  channels.className='update-channels'; summary.textContent='更新渠道（高级）'; sources.id='update-manifest-sources'; sources.rows=3; sources.maxLength=6150; sources.placeholder='每行一个 HTTPS 清单地址，最多 3 个；留空使用默认渠道';
  label.textContent='备用／自建更新清单'; label.append(sources); save.type='submit'; save.textContent='保存更新渠道'; save.id='save-update-sources';
  help.textContent='填写你信任的更新清单地址。自定义地址按顺序尝试；留空优先直接读取静态清单，失败才查询 GitHub Releases。清单和 APK 都需要可达。下载中断后可继续，安装前校验包名、版本、SHA-256 和签名。配置仅保存在当前设备。';
  form.append(label,help,save); channels.append(summary,form); container.append(channels);
  let previousSources=null, wasConnected=container.isConnected;
  const paint=()=>{
    if(wasConnected&&!container.isConnected){state.views.delete(paint);return;}
    wasConnected = wasConnected || container.isConnected;
    const downloading=state.locked&&state.phase==='available';
    const labels={check:'检查更新',available:state.bytes?'继续下载并安装':'下载并安装新版',ready:'继续安装',installer:'再次打开安装器'};
    button.disabled=state.locked||(!state.channelPublished&&state.phase==='check');
    button.textContent=state.locked?(state.phase==='check'?'正在检查…':downloading?(state.progressPhase==='verifying'?'正在校验安装包…':'正在下载…'):'正在处理…'):(!state.channelPublished&&state.phase==='check'?'在线更新未启用':labels[state.phase]);
    progress.hidden=!downloading; progress.value=state.total?state.bytes/state.total:0;
    pause.hidden=!downloading||state.progressPhase==='verifying'||typeof plugin.pause!=='function';
    pause.disabled=state.pausing===true;
    message.textContent=downloading?`${(progress.value*100).toFixed(0)}% · ${(state.bytes/1048576).toFixed(1)} / ${(state.total/1048576).toFixed(1)} MB${state.speed>0?' · '+(state.speed/1048576).toFixed(2)+' MB/s':''}`:state.message;
    notes.textContent=(state.manifest?.releaseNotes||[]).join('\n');
    save.disabled=state.locked||!state.configurable; sources.disabled=state.locked;
    const text=state.sources.join('\n'); if(previousSources!==text){sources.value=text;previousSources=text;}
  };
  state.views.add(paint); state.emit();
  form.onsubmit=async event=>{
    event.preventDefault(); if(state.locked)return;
    if(isBusy()){state.message='请先等待聊天生成结束，再修改更新渠道。';state.emit();return;}
    try {
      const values=normalizeUpdateSources(sources.value); state.locked=true; state.emit();
      const result=await plugin.setSources({sources:values}); state.sources=result.manifestSources||values;
      state.manifest=null; state.phase='check'; state.bytes=0; state.total=0;
      state.message=values.length?'更新渠道已保存，点击检查更新验证连通性。':'已恢复默认渠道；访问 GitHub 仍取决于当前网络与 VPN 分流。';
      record('更新渠道已保存',{custom_sources:values.map(value=>new URL(value).hostname)});
    }catch(e){state.message=updateError(e.message);record('更新渠道保存失败',{state:'failed',error:state.message});}
    finally{state.locked=false;state.emit();}
  };
  pause.onclick=async()=>{
    if(state.pausing)return; state.pausing=true;state.emit();
    try {await plugin.pause();} catch(e){state.message=updateError(e.message);}
    finally{state.pausing=false;state.emit();}
  };
  button.onclick=async()=>{
    if(state.locked)return;
    if(!state.channelPublished&&state.phase==='check')return;
    if(isBusy()){state.message='请先等待聊天生成结束，再进行更新。';state.emit();return;}
    state.locked=true; state.emit();
    try {
      if(state.phase==='check'){
        record('检查更新',{}); const result=await plugin.check(); state.manifest=result.available||null;
        record('更新检查结果',{version:state.manifest?.versionName,message:result.message,host:result.host,attempts:result.attempts});
        if(state.manifest){state.phase='available';state.bytes=0;state.total=state.manifest.sizeBytes;state.message=`发现 ${state.manifest.versionName}（${(state.total/1048576).toFixed(1)} MB）`;}
        else state.message=result.message;
      }else{
        if(state.phase==='available'){
          state.progressPhase='downloading';state.speed=0;state.lastTime=0;state.emit();
          await plugin.download({manifest:state.manifest});record('更新下载与校验完成',{version:state.manifest.versionName});state.phase='ready';state.emit();
        }
        const result=await plugin.install(); record('更新安装步骤',{status:result.status});
        state.phase=result.status==='permission'?'ready':'installer';
        state.message=result.status==='permission'?'请允许 T- 安装应用，返回后点击“继续安装”。':'已打开系统安装器，请确认更新；取消后可再次打开。聊天记录会保留。';
      }
    }catch(e){
      const error=updateError(e.message); record('更新失败',{state:'failed',error,stage:e.data?.stage,host:e.data?.host,attempts:e.data?.attempts});
      const attempts=e.data?.attempts||[];
      state.message=error+(attempts.length?'\n已尝试：'+attempts.map(item=>item.host+'（'+({DNS:'域名解析失败',timeout:'超时',TLS:'安全连接失败',invalid_json:'清单不是有效 JSON',request_or_manifest:'请求或清单失败'}[item.reason]||item.status)+'）').join('、'):'');
    }finally{state.locked=false;state.emit();}
  };
  return ()=>state.views.delete(paint);
}
