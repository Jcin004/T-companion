// SPDX-License-Identifier: AGPL-3.0-only
import {acquire} from './resident-lock.js';
import {ensureLife,validateLife,lifeTime,beginLifeRun,nextLifeJob,lifePrompt,reserveLifeRequest,recordLifeResponse,applyLifeResponse,failLifeJob,resumeLifeRun} from './resident-life-core.js';
import {parseModelObject} from './model-json.js';
export class ResidentLifeService {
  constructor(host){this.host=host;this.cancelled=false;}
  async run(id,resume=false,skip=false){
    const release=await acquire('resident-batch');this.cancelled=false;
    try{
      if(this.host.active)throw Error('请等待当前模型操作完成');
      await this.host.transact(d=>resume?resumeLifeRun(d,id,lifeTime(d),skip):beginLifeRun(d,id,lifeTime(d)));
      while(!this.cancelled){
        const job=await this.host.transact(d=>nextLifeJob(d,id,lifeTime(d)));if(!job)break;
        if(['requesting','uncertain'].includes(job.state)){
          await this.host.transact(d=>failLifeJob(d,job.id,lifeTime(d),true));throw Error('请求结果不确定，未自动重新计费；请明确跳过');
        }
        let validated=false;
        try{
          if(job.state==='prepared'){
            const d=this.host.data,owner=job.owner_id;
            let memories=d.memory.events.filter(m=>m.owner_id===owner&&m.active);
            if(this.host.embeddedMemory){const ranked=await this.host.embeddedMemory.recall(d,owner,'当前经历 '+(ensureLife(d).plans[owner]||''),{});const ids=ranked.ranked.flat().map(r=>r.id);memories=memories.filter(m=>ids.includes(m.id));}
            const prompt=lifePrompt(d,job,memories);
            await this.host.transact(next=>reserveLifeRequest(next,job.id,lifeTime(next),prompt));
            const text=await this.host.auxiliary(prompt,{purpose:'居民 '+job.kind,profile_id:job.kind==='memory'?d.memory.settings.profile_id:undefined});
            const value=parseModelObject(text).value;
            await this.host.transact(next=>recordLifeResponse(next,job.id,value,lifeTime(next)));
          }
          if(this.cancelled)break;
          applyLifeResponse(JSON.parse(JSON.stringify(this.host.data)),job.id,lifeTime(this.host.data));validated=true;
          await this.host.transact(d=>applyLifeResponse(d,job.id,lifeTime(d)));
        }catch(error){
          // Keep a durable completed candidate for an apply-only retry after disk failure.
          const current=ensureLife(this.host.data).jobs.find(j=>j.id===job.id);
          if(current?.state!=='responded'||!validated)await this.host.transact(d=>{const j=ensureLife(d).jobs.find(j=>j.id===job.id);failLifeJob(d,job.id,lifeTime(d),j?.state==='requesting');});
          throw error;
        }
      }
      return this.host.data.world.life.runs.find(r=>r.id===id);
    }finally{release();}
  }
  async api(path,method,body={}){
    const part=new URL(path,'https://local').pathname.split('/')[2];
    if(method==='GET')return JSON.parse(JSON.stringify(ensureLife(this.host.data)));
    if(part==='run')return this.run(body.request_id||('batch_'+Date.now().toString(36)));
    if(part==='resume')return this.run(body.run_id,true,body.skip_uncertain===true);
    if(part==='cancel'){this.cancelled=true;this.host.cancel();return this.host.transact(d=>{const l=ensureLife(d);l.settings.enabled=false;for(const r of l.runs)if(r.state==='running')r.state='paused';});}
    if(part==='settings')return this.host.transact(d=>{const l=ensureLife(d);l.settings={...l.settings,...body};validateLife(d);return l.settings;});
    throw Error('不支持的居民生活操作');
  }
}
