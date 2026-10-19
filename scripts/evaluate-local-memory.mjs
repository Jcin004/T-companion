// Synthetic evaluation through existing application commands and request assembly.
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {LocalService, emptyData} from '../frontend/local-service.js';
import {recallPlan} from '../frontend/memory-core.js';

const fixture=JSON.parse(await readFile(new URL('../tests/fixtures/memory-evaluation.json',import.meta.url),'utf8'));
let calls=0;
const disk={value:emptyData(),async load(){return structuredClone(this.value);},async save(value){this.value=structuredClone(value);},async hasKey(){return true;},async getKey(){return 'synthetic-key';}};
const received=[];
const model=async(_settings,_key,messages,delta)=>{calls++;received.push(structuredClone(messages));delta('模拟回复');};
let service=await new LocalService(disk,model).init();
await service.api('/settings','PATCH',{model:'fixture'});
const stores=new Map(),ids=new Map();
for(const row of fixture.records){
  const key=row.owner+'/'+row.scope;
  if(!stores.has(key)){
    const person=await service.api('/characters','POST',{name:key,identity:'测试人物',style:'',avatar:''});
    const contact=await service.api('/contacts','POST',{character_id:person.id});
    await service.api('/contacts/'+contact.id,'PATCH',{history_limit:0});
    stores.set(key,{owner:person.id,sessionId:contact.id});
  }
  const store=stores.get(key);
  await service.stream(store.sessionId,row.text,'seed-'+row.id,()=>{});
  const source=service.data.messages.filter(m=>m.session_id===store.sessionId&&m.role==='user').at(-1);
  await service.api('/memories','POST',{owner_id:store.owner,title:row.query,content:row.text,kind:'experience',evidence:[{message_id:source.id,quote:row.text}]});
  const event=(await service.api('/memories?owner='+store.owner)).find(e=>e.title===row.query);
  ids.set(event.id,row.id);
}
const select=q=>{
  const store=stores.get(q.owner+'/'+q.scope);
  return recallPlan(service.data,store.owner,q.text,{sessionId:store.sessionId}).records.map(r=>ids.get(r.id));
};
const beforeCalls=calls,before=JSON.stringify(disk.value);
const cases=fixture.queries.map(q=>{
  const actual=select(q),pass=JSON.stringify([...actual].sort())===JSON.stringify([...q.expected].sort());
  return {id:q.id,expected:q.expected,actual,pass,probe:!!q.probe};
});
assert.equal(calls,beforeCalls);
assert.equal(JSON.stringify(disk.value),before);
service=await new LocalService(disk,model).init();
const restarted=select(fixture.queries[0]);
cases.push({id:'reload-from-storage',pass:restarted.includes('orchid')});
const store=stores.get('lin/daily');
await service.stream(store.sessionId,'青瓷兰花','verify-request',()=>{});
cases.push({id:'one-chat-call-with-memory',pass:calls-beforeCalls===1&&received.at(-1)[0].content.includes(fixture.records[0].text)});
const event=(await service.api('/memories?owner='+store.owner)).find(e=>e.title===fixture.records[0].query);
await service.api('/memories/'+event.id,'PATCH',{...event,active:false});
cases.push({id:'inactive-excluded',pass:!select(fixture.queries[0]).includes('orchid')});
const result={provider:'current-local',mode:'lexical; fake chat transport; separate synthetic character per scope',isolation_owner:'evaluation host routing; story scope is represented by a separate synthetic character, not a product feature',cases,chat_calls_during_queries:0,model_quality_tested:false};
console.log(JSON.stringify(result));
process.exitCode=cases.some(c=>!c.probe&&!c.pass)?1:0;
