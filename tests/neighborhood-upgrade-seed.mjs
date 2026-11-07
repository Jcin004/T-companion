// Reuse the retained synthetic 0.24 acceptance fixture; never inspect device data.
import {readFile,writeFile} from 'node:fs/promises';
let existing;
try{existing=JSON.parse(await readFile('artifacts/studio-upgrade-before.json','utf8'));}
catch(error){
 if(error.code!=='ENOENT')throw error;
 // Portable source-archive fallback uses the existing domain fixture pattern.
 const {LocalService,emptyData}=await import('../frontend/local-service.js');let disk=emptyData();
 const service=await new LocalService({load:async()=>structuredClone(disk),save:async d=>{disk=structuredClone(d);},hasKey:async()=>false},async(_s,_key,_messages,delta)=>delta('这是升级前的合成回复。')).init();
 await service.transact(d=>{d.characters=[{id:'a',name:'林',identity:'',style:'',avatar:''},{id:'b',name:'雨',identity:'',style:'',avatar:''}];d.character_looks={};});
 await service.api('/settings','PATCH',{model:'mock'});await service.api('/world/setup','POST',{character_ids:['a','b']});const contact=await service.api('/contacts','POST',{character_id:'a'});await service.stream(contact.id,'这是升级前的合成消息。','old-chat',()=>{});existing={state:service.data};
}
let data=typeof existing.state==='string'?JSON.parse(existing.state):existing.state;
if(data.characters.map(c=>c.name).join(',')!=='林,雨')throw Error('Expected retained synthetic wardrobe fixture');
let json=JSON.stringify(data);for(const [i,c] of data.characters.entries())json=json.replaceAll(c.id,['a','b'][i]);data=JSON.parse(json);
data.characters.push({id:'c',name:'岚',identity:'',style:'',avatar:''});data.synthetic_fixture='neighborhood-upgrade-v1';
data.world.version=1;delete data.world.locations;delete data.world.communication;delete data.world.life;
await writeFile('artifacts/neighborhood-upgrade-seed.json',JSON.stringify(data));
