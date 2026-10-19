// UI uses commands only; secrets are never written into a business document.
export function mountExternalMemoryUI({api,toast,report,isLocal}){
  const dialog=document.createElement('dialog');dialog.id='external-memory-dialog';dialog.className='memory-dialog';
  dialog.innerHTML='<header><h2>外部记忆 · OB（可选）</h2><button type="button" class="icon" aria-label="关闭">×</button></header><form class="memory-dialog-body"><p>默认使用本机记忆。启用后，本轮查询会发送到你部署的只读 OB 网关；失败时继续本地聊天。不会上传聊天历史或同步记忆。</p><label><input name="enabled" type="checkbox">聊天前查询外部记忆</label><label>网关地址<input name="url" type="url" placeholder="https://你的记忆网关"></label><label>访问口令<input name="token" type="password" autocomplete="new-password" placeholder="留空保留此地址已存口令"></label><label>等待上限（毫秒）<input name="timeout_ms" type="number" min="300" max="10000"></label><label>最多条数<input name="limit" type="number" min="1" max="12"></label><label>外部材料字符预算<input name="budget" type="number" min="500" max="6000"></label><div class="actions"><button class="primary">保存外部记忆设置</button><button type="button" data-test>测试已保存连接</button></div><p role="status" class="memory-status"></p><pre class="memory-text" data-receipt></pre></form>';
  document.body.append(dialog);
  const form=dialog.querySelector('form'),status=dialog.querySelector('[role=status]');let busy=false;
  const run=async fn=>{if(busy)return;busy=true;status.textContent='处理中…';try{await fn();}catch(error){status.textContent=error.message;report(error);toast(error.message);}finally{busy=false;}};
  dialog.querySelector('header button').onclick=()=>dialog.close();
  form.onsubmit=e=>{e.preventDefault();run(async()=>{
    const values={enabled:form.elements.enabled.checked,url:form.elements.url.value.trim()};
    for(const key of ['timeout_ms','limit','budget'])values[key]=Number(form.elements[key].value);
    if(form.elements.token.value)values.token=form.elements.token.value;
    await api('/external-memory','PATCH',values);form.elements.token.value='';status.textContent='已保存；只影响后续请求';toast('外部记忆设置已保存');
  });};
  dialog.querySelector('[data-test]').onclick=()=>run(async()=>{const result=await api('/external-memory/test','POST');status.textContent=result.vector_enabled?'连接成功，网关报告已启用向量':'连接成功；当前网关为关键词/BM25，未启用向量';});
  return async()=>{
    if(!isLocal())throw Error('外部记忆原型用于本机模式');
    const config=await api('/external-memory');
    for(const key of ['url','timeout_ms','limit','budget'])form.elements[key].value=config[key];
    form.elements.enabled.checked=config.enabled;form.elements.token.value='';
    status.textContent=config.has_token?'此地址已有口令':'此地址尚未配置口令';
    const last=config.last;dialog.querySelector('[data-receipt]').textContent=last?'最近召回：'+JSON.stringify(last,null,2):'暂无外部召回。来源为 OB 桶 ID，尚未核验原始聊天。';
    dialog.showModal();
  };
}
