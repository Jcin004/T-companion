// SPDX-License-Identifier: AGPL-3.0-only
// Shared classification vocabulary; rooms do not create separate memory stores.
export const memoryRooms=Object.freeze([
 {id:'living_room',label:'客厅',description:'日常经历与交谈'},
 {id:'bedroom',label:'卧室',description:'情感与关系'},
 {id:'study',label:'书房',description:'知识与技能'},
 {id:'user_room',label:'用户房',description:'关于用户的资料'},
 {id:'self_room',label:'自我房',description:'对自己的理解'},
 {id:'attic',label:'阁楼',description:'困惑与未解决的事'},
 {id:'windowsill',label:'窗台',description:'期盼与目标'}
].map(Object.freeze));
export function memoryRoom(value){
 if(value===undefined)return 'living_room';
 if(!memoryRooms.some(room=>room.id===value))throw Error('记忆房间无效');
 return value;
}
