// SPDX-License-Identifier: AGPL-3.0-only
// Android port. OB owns candidate ranking; the domain still owns evidence,
// reviewed links, identity and the shared context budget. No remote fallback.
import {recallInputs} from './memory-recall.js';

const snapshot=data=>data.memory.events.map(({id,owner_id,title,content,kind,active,evidence,revision,created_at,updated_at})=>
  ({id,owner_id,title,content,kind,active,evidence,revision,created_at,updated_at}));

export class EmbeddedMemory {
  constructor(plugin){this.plugin=plugin;this.last=null;this.saved=null;}
  async execute(action,data,extra={}){
    if(!this.plugin)throw Error('此安装包缺少内置 OB，请覆盖安装完整新版 APK');
    const response=await this.plugin.execute({request:JSON.stringify({action,records:snapshot(data),...extra})});
    let result;try{result=JSON.parse(response.result);}catch{throw Error('内置 OB 返回格式错误');}
    if(result?.provider!=='embedded-ob'||result.vector_enabled!==false)throw Error('内置 OB 版本不匹配');
    this.last=result;return result;
  }
  async sync(data){
    const serialized=JSON.stringify(snapshot(data));
    if(this.saved===serialized)return;
    await this.execute('sync',data);
    // This is only a projection cache marker, never a business commit marker.
    this.saved=serialized;
  }
  invalidate(){this.saved=null;}
  async recall(data,owner,query,options){
    const inputs=recallInputs(data,owner,query,options),queries=inputs.map(item=>item.text);
    const result=await this.execute('recall',data,{owner,queries});
    if(!Array.isArray(result.ranked)||result.ranked.length!==queries.length)throw Error('内置 OB 召回格式错误');
    const ids=new Set(data.memory.events.filter(e=>e.owner_id===owner&&e.active).map(e=>e.id));
    for(const rows of result.ranked){
      if(!Array.isArray(rows)||rows.length>36||rows.some(r=>!ids.has(r.id)||!Number.isFinite(r.score)||r.score<0||r.score>100)||new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('内置 OB 召回范围错误');
    }
    return {inputs,ranked:result.ranked};
  }
  status(){return {provider:'embedded-ob',installed:!!this.plugin,ready:!!this.last,
    commit:this.last?.commit,vector_enabled:false,count:this.last?.count||0,
    message:'OB 随 APK 在手机内运行；SQLite 保存原文与卡片，OB 缓存可自动重建。召回不请求模型；整理和总结使用已配置的模型。'};}
}
