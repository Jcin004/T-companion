// SPDX-License-Identifier: AGPL-3.0-only
// Metadata only. Secrets remain in each platform's separate key store.
export function ensureProfiles(data) {
  if(!Array.isArray(data.api_groups))data.api_groups=[];
  if(!Array.isArray(data.api_profiles)){
    data.api_profiles=[{id:'legacy',name:'原有连接',group_id:'',base_url:data.settings.base_url,model:data.settings.model,protocol:'openai-chat'}];
    data.active_profile_id='legacy';
  }
  if(!data.api_profiles.some(p=>p.id===data.active_profile_id))data.active_profile_id=data.api_profiles[0]?.id||'';
}
export function validateConnection(p) {
  if(!p.name?.trim()||p.name.length>80||typeof p.model!=='string'||p.model.length>200)throw Error('请填写连接名称，模型名不能超过 200 字');
  const u=new URL(p.base_url);
  if(u.username||u.password||u.search||u.hash||!(u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname))))throw Error('模型服务地址必须为 HTTPS（本机测试除外）');
  if(p.protocol!=='openai-chat')throw Error('当前仅支持 Chat Completions 协议');
  return {name:p.name.trim(),base_url:u.href.replace(/\/$/,''),model:p.model.trim(),protocol:p.protocol,group_id:p.group_id||''};
}
