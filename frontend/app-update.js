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
export function mountAppUpdate(container, plugin, isBusy=()=>false, record=()=>{}) {
  const button=document.createElement('button'), message=document.createElement('p'), notes=document.createElement('p'), progress=document.createElement('progress');
  message.style.whiteSpace='pre-line';
  button.type='button';button.id='check-update'; button.textContent='检查更新'; message.setAttribute('role','status'); progress.max=1; progress.hidden=true;
  container.append(button,progress,message,notes);
  const manual=document.createElement('a');manual.href='https://github.com/Jcin004/T-companion-updates/releases';manual.target='_blank';manual.rel='noopener noreferrer';manual.textContent='在浏览器打开下载页，手动覆盖安装';container.append(manual);
  if(!plugin){button.disabled=true;button.textContent='在线更新未启用';message.textContent='浏览器不能安装 APK 更新。请在 Android 应用内检查更新，或从公开下载渠道获取安装包。';return;}
  let phase='check', manifest=null, locked=true, channelPublished=true;
  const manualMessage='当前为私有手动更新，在线渠道尚未发布。收到新版 APK 后直接覆盖安装；不要卸载旧版。';
  const labels={check:'检查更新',available:'下载并安装新版',ready:'继续安装',installer:'再次打开安装器'};
  const paint=()=>{button.disabled=locked||(!channelPublished&&phase==='check');button.textContent=!channelPublished&&phase==='check'?'在线更新未启用':labels[phase]||'检查更新';};
  const channels=document.createElement('details'),summary=document.createElement('summary'),form=document.createElement('form'),label=document.createElement('label'),sources=document.createElement('textarea'),help=document.createElement('small'),save=document.createElement('button');
  channels.className='update-channels';summary.textContent='更新渠道（高级）';sources.id='update-manifest-sources';sources.rows=3;sources.maxLength=6150;sources.placeholder='每行一个 HTTPS 清单地址，最多 3 个；留空使用默认渠道';
  label.textContent='备用／自建更新清单';label.append(sources);save.type='submit';save.textContent='保存更新渠道';save.id='save-update-sources';save.disabled=true;
  help.textContent='填写你信任的更新清单地址，不是模型 API 地址。自定义地址按顺序尝试；首个有效清单生效。留空时使用 GitHub Releases，失败后尝试静态清单。清单与 APK 下载地址都必须可达；本应用仍会验证包名、版本、SHA-256 和安装签名。渠道配置仅保存在当前设备。';
  form.append(label,help,save);channels.append(summary,form);container.append(channels);
  form.onsubmit=async event=>{
    event.preventDefault();if(locked)return;
    if(isBusy()){message.textContent='请先等待聊天生成结束，再修改更新渠道。';return;}
    try {
      const values=normalizeUpdateSources(sources.value);locked=true;paint();save.disabled=true;
      const result=await plugin.setSources({sources:values});sources.value=(result.manifestSources||values).join('\n');
      manifest=null;phase='check';notes.textContent='';message.textContent=values.length?'更新渠道已保存，点击检查更新验证连通性。':'已恢复默认渠道；访问 GitHub 仍取决于当前网络与 VPN 分流。';
      record('更新渠道已保存',{custom_sources:values.map(value=>new URL(value).hostname)});
    }catch(e){message.textContent=updateError(e.message);record('更新渠道保存失败',{state:'failed',error:message.textContent});}
    finally{locked=false;paint();save.disabled=false;}
  };
  paint();
  Promise.resolve(plugin.addListener('progress',e=>{progress.value=Math.min(1,e.bytes/e.total);})).catch(()=>{});
  plugin.info().then(info=>{channelPublished=info.channelPublished!==false;sources.value=(info.manifestSources||[]).join('\n');save.disabled=info.configurableChannel!==true;if(!channelPublished)message.textContent=manualMessage;if(info.ready){manifest=info.ready;phase='ready';message.textContent='已恢复校验通过的安装包，可继续安装。';}}).catch(e=>{message.textContent=updateError(e.message);}).finally(()=>{locked=false;paint();});
  button.onclick=async()=>{
    if(locked)return;
    if(!channelPublished&&phase==='check'){message.textContent=manualMessage;return;}
    if(isBusy()){message.textContent='请先等待聊天生成结束，再进行更新。';return;}
    locked=true;paint();
    try {
      if(phase==='check'){
        button.textContent='正在检查…';record('检查更新',{});const result=await plugin.check();manifest=result.available||null;record('更新检查结果',{version:manifest?.versionName,message:result.message,host:result.host,attempts:result.attempts});
        if(manifest){phase='available';message.textContent=`发现 ${manifest.versionName}（${(manifest.sizeBytes/1048576).toFixed(1)} MB）`;notes.textContent=(manifest.releaseNotes||[]).join('\n');}
        else message.textContent=result.message;
      }else{
        if(phase==='available'){
          button.textContent='正在下载并校验…';progress.value=0;progress.hidden=false;
          await plugin.download({manifest});record('更新下载与校验完成',{version:manifest.versionName});phase='ready';progress.hidden=true;
        }
        const result=await plugin.install();
        record('更新安装步骤',{status:result.status});
        phase=result.status==='permission'?'ready':'installer';
        message.textContent=result.status==='permission'?'请允许 T- 安装应用，返回后点击“继续安装”。':'已打开系统安装器，请确认更新；取消后可再次打开。聊天记录会保留。';
      }
    }catch(e){const error=updateError(e.message);record('更新失败',{state:'failed',error,stage:e.data?.stage,host:e.data?.host,attempts:e.data?.attempts});const attempts=e.data?.attempts||[];message.textContent=error+(attempts.length?'\n已尝试：'+attempts.map(item=>item.host+'（'+({DNS:'域名解析失败',timeout:'超时',TLS:'安全连接失败',invalid_json:'清单不是有效 JSON',request_or_manifest:'请求或清单失败'}[item.reason]||item.status)+'）').join('、'):'');progress.hidden=true;}
    finally{locked=false;paint();}
  };
}
