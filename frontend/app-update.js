// SPDX-License-Identifier: AGPL-3.0-only
// Kept outside page navigation so leaving Settings never resets an active transfer.
export function updateError(message='') {
  if(/unable to resolve host|unknownhost|name.*not resolved|dns/i.test(message))return '无法解析更新服务器地址，请检查手机网络或 DNS；本次未完成更新检查。';
  if(/timeout|timed out/i.test(message))return '连接更新服务器超时，请稍后重试；本次未完成更新检查。';
  if(/ssl|certificate|handshake/i.test(message))return '更新服务器的安全连接验证失败，请检查网络和系统时间。';
  return message||'更新失败，请重试';
}
export function mountAppUpdate(container, plugin, isBusy=()=>false, record=()=>{}) {
  const button=document.createElement('button'), message=document.createElement('p'), notes=document.createElement('p'), progress=document.createElement('progress');
  button.id='check-update'; button.textContent='检查更新'; message.setAttribute('role','status'); progress.max=1; progress.hidden=true;
  container.append(button,progress,message,notes);
  if(!plugin){button.disabled=true;button.textContent='在线更新未启用';message.textContent='浏览器不能安装 APK 更新。请在 Android 应用内检查更新，或从公开下载渠道获取安装包。';return;}
  let phase='check', manifest=null, locked=true, channelPublished=true;
  const manualMessage='当前为私有手动更新，在线渠道尚未发布。收到新版 APK 后直接覆盖安装；不要卸载旧版。';
  const labels={check:'检查更新',available:'下载并安装新版',ready:'继续安装',installer:'再次打开安装器'};
  const paint=()=>{button.disabled=locked||(!channelPublished&&phase==='check');button.textContent=!channelPublished&&phase==='check'?'在线更新未启用':labels[phase]||'检查更新';};
  paint();
  Promise.resolve(plugin.addListener('progress',e=>{progress.value=Math.min(1,e.bytes/e.total);})).catch(()=>{});
  plugin.info().then(info=>{channelPublished=info.channelPublished!==false;if(!channelPublished)message.textContent=manualMessage;if(info.ready){manifest=info.ready;phase='ready';message.textContent='已恢复校验通过的安装包，可继续安装。';}}).catch(e=>{message.textContent=updateError(e.message);}).finally(()=>{locked=false;paint();});
  button.onclick=async()=>{
    if(locked)return;
    if(!channelPublished&&phase==='check'){message.textContent=manualMessage;return;}
    if(isBusy()){message.textContent='请先等待聊天生成结束，再进行更新。';return;}
    locked=true;paint();
    try {
      if(phase==='check'){
        button.textContent='正在检查…';record('检查更新',{});const result=await plugin.check();manifest=result.available||null;record('更新检查结果',{version:manifest?.versionName,message:result.message});
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
    }catch(e){const error=updateError(e.message);record('更新失败',{state:'failed',error});message.textContent=error;progress.hidden=true;}
    finally{locked=false;paint();}
  };
}
