import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalService,emptyData,validateBackup} from '../frontend/local-service.js';
import {DEFAULT_ACTION_PROMPT,normalizeChatStyle,replyParts,turnChatStyle,styleInstructions} from '../frontend/chat-style.js';
const copy=v=>JSON.parse(JSON.stringify(v));
function persistence(){return {value:emptyData(),keys:new Map([['legacy','old-test-key']]),async load(){return copy(this.value);},async save(v){this.value=copy(v);},async hasKey(id='legacy'){return !!this.keys.get(id);},async getKey(id='legacy'){return this.keys.get(id)||'';},async setKey(v,id='legacy'){v?this.keys.set(id,v):this.keys.delete(id);}};}
test('legacy connection migrates without moving secrets; grouped profiles route the correct credentials',async()=>{
  const store=persistence();store.value.settings.model='old-model';const calls=[];
  const service=await new LocalService(store,async(s,key)=>calls.push({model:s.model,key})).init();
  assert.equal((await service.publicSettings()).has_api_key,true);
  await service.api('/model-groups','POST',{name:'个人'});const group=service.data.api_groups[0];
  await service.api('/model-profiles','POST',{name:'备用',group_id:group.id,base_url:'https://example.org/v1',model:'other',protocol:'openai-chat',api_key:'second-test-key'});
  const second=service.data.api_profiles[1];await service.api('/model-profiles/'+second.id+'/activate','POST');
  await service.callModel([],()=>{},new AbortController().signal);assert.deepEqual(calls.pop(),{model:'other',key:'second-test-key'});
  await service.api('/model-profiles/legacy/activate','POST');await service.callModel([],()=>{},new AbortController().signal);assert.deepEqual(calls.pop(),{model:'old-model',key:'old-test-key'});
  assert.ok(!JSON.stringify(await service.api('/backup')).includes('test-key'));
  await service.api('/model-groups/'+group.id,'DELETE');assert.equal(service.data.api_profiles.find(p=>p.id===second.id).group_id,'');
  await service.api('/model-profiles/'+second.id,'DELETE');assert.equal(store.keys.has(second.id),false);assert.equal(store.keys.get('legacy'),'old-test-key');
  const reopened=await new LocalService(store,async()=>{}).init();assert.equal(reopened.data.active_profile_id,'legacy');
});
test('switching during a generation is rejected; deletion selects remaining connection',async()=>{
  const service=await new LocalService(persistence(),async()=>{}).init();
  await service.api('/model-profiles','POST',{name:'新连接',base_url:'https://example.org/v1',model:'m',protocol:'openai-chat'});
  service.active=new AbortController();await assert.rejects(service.api('/model-profiles/legacy/activate','POST'),/等待/);service.active=null;
  await service.api('/model-profiles/legacy','DELETE');assert.equal(service.data.active_profile_id,service.data.api_profiles[0].id);
});
test('editing a connection to another host cannot silently reuse its credential',async()=>{
  const service=await new LocalService(persistence(),async()=>{}).init();
  const value={name:'变更地址',base_url:'https://different.example/v1',model:'m',protocol:'openai-chat'};
  await assert.rejects(service.api('/model-profiles/legacy','PATCH',value),/域名/);
  await service.api('/model-profiles/legacy','PATCH',{...value,clear_key:true});assert.equal((await service.publicSettings()).has_api_key,false);
});
test('backup validation strips per-profile secret fields and rejects invalid endpoints',async()=>{
  const service=await new LocalService(persistence(),async()=>{}).init();const backup=await service.api('/backup');
  backup.api_profiles[0].api_key='must-not-import';assert.ok(!JSON.stringify(validateBackup(backup)).includes('must-not-import'));
  backup.api_profiles[0].base_url='javascript:alert(1)';assert.throws(()=>validateBackup(backup),/HTTPS/);
});
test('natural blank-line split protects code fences and respects disabled presentation actions',()=>{
  const text='第一条。\n\n第二条。\n\n[动作:轻轻挥手][表情:🙂][语音:晚安]\n\n```js\nconst x=1;\n\nconst y=2;\n```';
  const parts=replyParts(text,{actions:true,emoji:50,voice:50});assert.deepEqual(parts.map(p=>p.type),['text','text','action','emoji','voice','text']);
  const disabled=replyParts(text,{actions:false,emoji:0,voice:0});assert.ok(!disabled.some(p=>p.type==='action'||p.type==='emoji'||p.type==='voice'));assert.ok(disabled.some(p=>p.text==='晚安'));
  assert.equal(replyParts('a\n\nb',{split:false}).length,1);assert.ok(!replyParts('[动作:未结束',{actions:true},true).length);
});
test('fixed candidate policy is deterministic on retry; zero always disables, dynamic preserves choices',()=>{
  const style={actions:true,mode:'fixed',action_weight:70,emoji:0,voice:100};assert.deepEqual(turnChatStyle(style,'same'),turnChatStyle(style,'same'));
  const policy=turnChatStyle(style,'same');assert.equal(policy.emoji,0);assert.equal(policy.voice,100);
  assert.match(styleInstructions({mode:'dynamic'}),/人设|情景/);
});
test('style and appearance persist; request snapshot survives policy edits and restart',async()=>{
  const store=persistence();const service=await new LocalService(store,async(s,k,m,delta)=>{assert.match(m[0].content,/当前私聊表达设置/);delta('一条\n\n另一条');}).init();
  const c=await service.api('/characters','POST',{name:'林',identity:'真实设定',style:'轻松',avatar:''});const s=await service.api('/contacts','POST',{character_id:c.id});
  await service.api('/settings','PATCH',{model:'test',wallpaper:'sea',font_family:'serif'});await service.api('/contacts/'+s.id,'PATCH',{chat_style:{actions:true,emoji:0,voice:0}});
  await service.stream(s.id,'你好','style-test',()=>{});assert.equal(service.data.turns[0].chat_style.actions,true);
  const restored=await new LocalService(store,async()=>{}).init();assert.equal(restored.data.settings.wallpaper,'sea');assert.equal((await restored.api('/contacts/'+s.id+'/messages')).items[1].chat_style.actions,true);
});


test('action templates default to online chat and replace only known placeholders once',()=>{
  assert.equal(normalizeChatStyle({actions:true}).action_prompt,DEFAULT_ACTION_PROMPT);
  assert.match(styleInstructions({actions:true}),/线上私聊/);
  const template='{{char}}向{{user}}发送表情，倾向{{action_weight}}，保留{{unknown}}';
  const prompt=styleInstructions({actions:true,action_weight:65,action_prompt:template},{characterName:'林{{user}}'});
  assert.match(prompt,/林\{\{user\}\}向用户发送表情，倾向65，保留\{\{unknown\}\}/);
  assert.match(prompt,/不要声称已操作真实设备/);
  assert.ok(!styleInstructions({actions:false,action_prompt:template}).includes(template));
  assert.equal(normalizeChatStyle({action_prompt:'   '}).action_prompt,DEFAULT_ACTION_PROMPT);
  assert.throws(()=>normalizeChatStyle({action_prompt:'x'.repeat(4001)}),/4000/);
  assert.throws(()=>normalizeChatStyle({action_prompt:123}),/文字/);
});

test('per-chat action template survives backup and restart; retry retains original template',async()=>{
  const store=persistence(),prompts=[];
  const model=async(s,k,m,delta)=>{prompts.push(m[0].content);if(prompts.length===1)throw Error('fixture interrupted');delta('收到');};
  let service=await new LocalService(store,model).init();
  const character=await service.api('/characters','POST',{name:'林',identity:'',style:'',avatar:''});
  const chat=await service.api('/contacts','POST',{character_id:character.id});
  await service.api('/settings','PATCH',{model:'fixture'});
  const style={actions:true,action_prompt:'旧模板：{{char}}远程发消息，{{action_weight}}'};
  await service.api('/contacts/'+chat.id,'PATCH',{chat_style:style});
  await assert.rejects(service.stream(chat.id,'你好','template-retry',()=>{}),/fixture interrupted/);
  await service.api('/contacts/'+chat.id,'PATCH',{chat_style:{...style,action_prompt:'新模板：{{char}}正在打字'}});
  const backup=validateBackup(await service.api('/backup'));
  assert.equal(backup.sessions.find(s=>s.id===chat.id).chat_style.action_prompt,'新模板：{{char}}正在打字');
  service=await new LocalService(store,model).init();
  await service.stream(chat.id,'你好','template-retry',()=>{});
  assert.match(prompts[1],/旧模板：林远程发消息，40/);
  await service.stream(chat.id,'继续','template-new',()=>{});
  assert.match(prompts[2],/新模板：林正在打字/);
  const before=copy(store.value);
  await assert.rejects(service.api('/contacts/'+chat.id,'PATCH',{chat_style:{...style,action_prompt:'x'.repeat(4001)}}),/4000/);
  assert.deepEqual(store.value,before);
});
