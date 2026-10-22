// SPDX-License-Identifier: AGPL-3.0-only
// Rendering only; positions, facing and interactions belong to world commands.
import {drawRoom,drawActor} from './world-art.js';
export function drawWorld(canvas,world,visualPositions=world.state.positions,poses={}){
  const c=canvas.getContext('2d');c.clearRect(0,0,canvas.width,canvas.height);
  drawRoom(c,canvas.width,canvas.height,world.state);
  for(const [id,p] of Object.entries(visualPositions).sort((a,b)=>a[1].y-b[1].y))drawActor(c,world,id,p,poses[id]);
  canvas.dataset.drawn='yes';
}
