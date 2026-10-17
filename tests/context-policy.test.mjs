import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalService,emptyData,buildContext,validateBackup} from '../frontend/local-service.js';
import {historyLimit} from '../frontend/context-policy.js';
import {DiagnosticStore} from '../frontend/diagnostics.js';
const clone=v=>JSON.parse(JSON.stringify(v));
test('history limit supports zero, more than 30, per-chat inheritance and secret-free backup/restart',async()=>{
 const storage={value:emptyData(),async load(){return clone(this.value);},async save(d){this.value=clone(d);},async getKey(){return '';},async hasKey(){return false;}};
 const logs=await new DiagnosticStore({async load(){return null;},async save(){}}).init();let sent;
 const service=await new LocalService(storage,async(s,k,m,delta)=>{sent=clone(m);delta('回复');},logs).init();
 const role=await service.api('/characters','POST',{name:'甲',identity:'身份',style:'',avatar:''}),contact=await service.api('/contacts','POST',{character_id:role.id});
 await service.transact(d=>{for(let i=0;i<40;i++){d.messages.push({id:i*2+1,session_id:contact.id,role:'user',content:'问题'+i,created_at:'2026-01-01T00:00:00Z'},{id:i*2+2,session_id:contact.id,role:'assistant',content:'回复'+i,created_at:'2026-01-01T00:00:00Z'});d.turns.push({request_id:'old_'+i,session_id:contact.id,user_id:i*2+1,assistant_id:i*2+2,state:'complete'});}});
 assert.equal(buildContext(service.data,contact.id,'本次').length,32);
 await service.api('/settings','PATCH',{history_limit:64,model:'mock'});assert.equal(buildContext(service.data,contact.id,'本次').length,66);
 await service.api('/contacts/'+contact.id,'PATCH',{history_limit:0});assert.equal(buildContext(service.data,contact.id,'本次').length,2);
 await service.stream(contact.id,'本次','current_history_request',()=>{});assert.equal(sent.length,2);assert.equal(logs.state.entries[0].history_count,0);assert.equal(service.data.messages.length,82);
 await service.api('/contacts/'+contact.id,'PATCH',{history_limit:null});assert.equal(historyLimit(service.data,contact.id),64);
 await service.api('/contacts/'+contact.id,'PATCH',{history_limit:7});
 const backup=validateBackup(await service.api('/backup'));assert.equal(backup.settings.history_limit,64);assert.equal(backup.sessions[0].history_limit,7);
 const recovered=await new LocalService(storage,async()=>{}).init();assert.equal(buildContext(recovered.data,contact.id,'新问题').length,9);
 for(const value of [-1,2001,1.5,'30',true]){await assert.rejects(service.api('/settings','PATCH',{history_limit:value}));await assert.rejects(service.api('/contacts/'+contact.id,'PATCH',{history_limit:value}));}
 const invalid=clone(backup);invalid.settings.history_limit='20';assert.throws(()=>validateBackup(invalid));
});
