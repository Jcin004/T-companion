// SPDX-License-Identifier: AGPL-3.0-only
export function mountEmbeddedMemoryUI({api}){
  const dialog=document.createElement('dialog');dialog.className='memory-dialog';dialog.id='embedded-memory-dialog';
  dialog.innerHTML='<header><h2>内置 OB 记忆</h2><button type="button" class="icon" aria-label="关闭">×</button></header><div class="memory-dialog-body"><p data-state></p><p data-info></p><p>完整流程：完成聊天 → 手动整理或达到自动整理阈值 → 核验原话后保存 → 新消息由手机内的 OB 召回 → 编辑、停用或删除立即影响后续召回。</p><p>原话、来源、版本、关联和总结保留在同一份本机备份内。无需启动电脑，也无需记忆服务地址和额外口令。当前为中文分词、BM25 和模糊匹配，尚无向量语义检索。</p></div>';
  dialog.querySelector('header button').onclick=()=>dialog.close();document.body.append(dialog);
  return async()=>{const status=await api('/memory-engine');dialog.querySelector('[data-state]').textContent=status.ready?'已就绪 · '+status.count+' 条记忆':'尚未就绪';dialog.querySelector('[data-info]').textContent=status.message;dialog.showModal();};
}
