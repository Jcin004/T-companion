// SPDX-License-Identifier: AGPL-3.0-only
// Original pixel art drawn on a 288x312 logical canvas; no external bitmap assets.
import {ROOM,FURNITURE} from './world-map.js';
export function drawWorld(canvas,world,visualPositions=world.state.positions){
  const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;
  const rect=(x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
  const border=(x,y,w,h,color='#704438')=>{rect(x,y,w,h,color);rect(x+2,y+2,w-4,h-4,'#c78c62');};
  rect(0,0,288,312,'#573c38');rect(8,8,272,64,'#e9c7ac');
  for(let y=72;y<290;y+=12)for(let x=12;x<278;x+=48){rect(x+(y%24?0:-24),y,47,11,(x+y)%36?'#bf865e':'#c99167');rect(x,y,1,11,'#8d5c44');}
  rect(10,67,268,6,'#805340');rect(10,288,268,8,'#724a3c');
  // Window, night sky, frame and rose curtains.
  border(175,14,67,48);rect(180,18,57,38,'#414967');rect(184,23,2,2,'#eed7aa');rect(220,28,2,2,'#eed7aa');rect(206,18,3,38,'#b67b52');rect(180,37,57,3,'#b67b52');
  for(let x=164;x<180;x+=4)rect(x,15,4,51,x%8?'#b66c79':'#d18b93');
  for(let x=237;x<253;x+=4)rect(x,15,4,51,x%8?'#b66c79':'#d18b93');
  rect(161,12,96,3,'#704438');
  // Rug.
  rect(76,147,135,113,'#946d61');rect(79,150,129,107,'#e5bea0');rect(84,155,119,97,'#b7ab82');rect(87,158,113,91,'#e9cfaa');
  for(let x=94;x<196;x+=16){rect(x,159,4,3,'#8b966a');rect(x,244,4,3,'#8b966a');}
  for(const f of FURNITURE){
    const x=f.x*24,y=f.y*24;
    if(f.id==='books'){
      border(x,y-26,72,72);rect(x+4,y-20,64,62,'#704438');
      for(let row=0;row<3;row++){for(let i=0;i<10;i++)rect(x+6+i*6,y-17+row*20,4,14,['#9c6574','#c5ab71','#78928a','#d3bca4'][i%4]);rect(x+2,y+row*20,68,3,'#b67c55');}
    }else if(f.id==='desk'){
      rect(x+2,y+10,4,17,'#704438');rect(x+40,y+10,4,17,'#704438');border(x,y-4,48,17);rect(x+14,y-2,22,10,'#f5dfb9');rect(x+24,y-2,1,10,'#a58164');
    }else if(f.id==='bed'){
      border(x,y,48,96);rect(x+4,y+7,40,82,'#e4c5a7');rect(x+6,y+10,36,19,'#fae4c8');rect(x+5,y+34,38,53,'#c78389');
      for(let by=35;by<85;by+=8)for(let bx=6;bx<42;bx+=8)rect(x+bx,y+by,4,4,'#dfaaa7');rect(x+1,y+87,46,6,'#81503e');
    }else if(f.id==='lamp'){
      border(x,y+4,24,22);if(world.state.lamp){rect(x-7,y-12,38,26,'#f0cf9166');}rect(x+10,y-1,4,15,'#a47b4b');rect(x+4,y-13,16,15,world.state.lamp?'#ffe2a0':'#bfad92');rect(x+1,y-1,22,3,'#bf9865');
    }else{
      rect(x+5,y+26,16,17,'#b47c66');rect(x+2,y+24,22,5,'#dfae8e');rect(x+11,y-5,3,30,'#678051');
      for(const [px,py] of [[0,0],[12,4],[-1,12],[13,16],[5,-9]]){rect(x+px,y+py,10,7,'#657d50');rect(x+px+2,y+py,7,3,'#95a16e');}
    }
  }
  rect(30,20,44,25,'#a27157');rect(33,23,38,19,'#f1d5b0');rect(49,26,6,13,'#789067');rect(44,31,17,5,'#789067');
  for(const [id,p] of Object.entries(visualPositions).sort((a,b)=>a[1].y-b[1].y)){
    const x=Math.round(p.x*24),y=Math.round(p.y*24),index=world.state.residents.indexOf(id),shirt=id==='user'?'#668c81':index===0?'#8b7495':'#b67775';
    rect(x+4,y+18,16,4,'#674d4455');rect(x+7,y+14,4,7,'#4c4145');rect(x+14,y+14,4,7,'#4c4145');rect(x+5,y+1,15,14,shirt);rect(x+3,y+4,3,10,'#e4bda1');rect(x+20,y+4,3,10,'#e4bda1');
    rect(x+6,y-11,13,14,'#e9c5a4');rect(x+5,y-13,15,6,id==='user'?'#624b42':index===0?'#b48759':'#60484c');rect(x+6,y-7,2,6,'#654c42');rect(x+11,y-3,2,2,'#493b3e');rect(x+17,y-3,2,2,'#493b3e');
    const name=id==='user'?'我':world.residents.find(r=>r.id===id)?.name||'?';c.font='9px sans-serif';c.textAlign='center';c.fillStyle='#fff0d3';c.fillText(name,x+12,y-18,64);
  }
}
