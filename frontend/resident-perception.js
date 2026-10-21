// Adapted from AiScheduler.gatherContext in Alicization Town 1a33ba65.
// AGPL-3.0-or-later; CeresOPA. See vendor/alicization-town-life/provenance.json.
// Pure neighborhood projection: include residents, remove server and memory dependencies.
export function nearbyResidents(npcId,residents,positions,characters,range=3){
  const npc=positions[npcId],nearbyPlayers=[];
  for(const id of residents){
    const player=positions[id];
    if(id===npcId)continue;
    const distance=Math.abs(player.x-npc.x)+Math.abs(player.y-npc.y);
    if(distance<=range)nearbyPlayers.push({id,name:characters.find(c=>c.id===id).name,position:{...player},distance});
  }
  return nearbyPlayers;
}
