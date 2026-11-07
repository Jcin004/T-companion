// SPDX-License-Identifier: AGPL-3.0-only
import {acquire} from './resident-lock.js';
import {ensureLife,validateLife,lifeTime,beginLifeRun,nextLifeJob,lifePrompt,reserveLifeRequest,recordLifeResponse,applyLifeResponse,failLifeJob,resumeLifeRun,advanceResidentRules,acceptResidentPlan,wakeResident} from './resident-life-core.js';
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
    if(part==='tick')return this.host.transact(d=>{ensureLife(d);if(body.target_at)throw Error('世界按现实时间推进，不接受界面改写时间');return advanceResidentRules(d,new Date().toISOString(),new Date().toISOString());});
    if(part==='plan')return this.host.transact(d=>{ensureLife(d);const result=acceptResidentPlan(d,body.owner_id,body.plan,body.request_id,new Date().toISOString());validateLife(d);return result;});
    if(part==='retry-plan')return this.host.transact(d=>{const l=ensureLife(d);if(!d.world.residents.includes(body.owner_id))throw Error('人物尚未入驻');delete l.plan_errors[body.owner_id];if(l.schedules[body.owner_id])wakeResident(d,body.owner_id,'replan','retry_'+body.request_id);return {ok:true};});
    if(part==='run')return this.run(body.request_id||('batch_'+Date.now().toString(36)));
    if(part==='resume')return this.run(body.run_id,true,body.skip_uncertain===true);
    if(part==='cancel'){this.cancelled=true;this.host.cancel();return this.host.transact(d=>{const l=ensureLife(d);l.settings.enabled=false;for(const r of l.runs)if(r.state==='running')r.state='paused';});}
    if(part==='settings')return this.host.transact(d=>{const l=ensureLife(d);if(!l.settings.enabled&&body.enabled){const now=Date.now(),shift=Math.max(0,now-Date.parse(l.simulated_at));for(const p of Object.values(l.schedules))p.next_at=new Date(Date.parse(p.next_at)+shift).toISOString();for(const a of Object.values(l.activities)){a.ends_at=new Date(Date.parse(a.ends_at)+shift).toISOString();if(a.started_at)a.started_at=new Date(Date.parse(a.started_at)+shift).toISOString();}l.simulated_at=new Date(now).toISOString();}l.settings={...l.settings,...body};validateLife(d);return l.settings;});
    throw Error('不支持的居民生活操作');
  }
}
