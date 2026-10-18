// SPDX-License-Identifier: AGPL-3.0-only
const el=id=>document.getElementById(id);
export function applyAppearance(p={}){
  const root=document.documentElement,phone=document.querySelector('.phone');
  document.body.classList.toggle('dark',p.theme==='dark');
  root.style.setProperty('--font',Math.max(12,Math.min(24,Number(p.font_size)||16))+'px');
  root.style.fontFamily={system:'"Segoe UI","Microsoft YaHei",sans-serif',serif:'"Noto Serif SC","SimSun",serif',rounded:'"MiSans Rounded","YouYuan",sans-serif'}[p.font_family]||'"Segoe UI","Microsoft YaHei",sans-serif';
  phone.dataset.icons=p.icon_style||'soft';phone.dataset.motion=p.motion===false?'off':'on';
  const ink=c=>/^#[0-9a-f]{6}$/i.test(c||'')?(parseInt(c.slice(1,3),16)*.299+parseInt(c.slice(3,5),16)*.587+parseInt(c.slice(5,7),16)*.114>150?'#253c43':'#ffffff'):'var(--ink)';
  const colour=(c,fallback)=>/^#[0-9a-f]{6}$/i.test(c||'')?c:fallback;
  root.style.setProperty('--bubble-user',colour(p.bubble_user,'var(--soft)'));root.style.setProperty('--bubble-assistant',colour(p.bubble_assistant,'var(--paper)'));root.style.setProperty('--bubble-radius',Math.max(2,Math.min(28,Number(p.bubble_radius)||16))+'px');root.style.setProperty('--bubble-user-ink',ink(p.bubble_user));root.style.setProperty('--bubble-assistant-ink',ink(p.bubble_assistant));
  const palettes={forest:'radial-gradient(ellipse at 20% 5%,#e5edcd,transparent 45%),linear-gradient(155deg,#a9c5b0,#658f88 60%,#315b61)',dusk:'radial-gradient(ellipse at 20% 5%,#ffeed3,transparent 50%),linear-gradient(155deg,#dfb8bc,#a47f9b 65%,#555777)',sea:'radial-gradient(ellipse at 20% 5%,#e1f6ef,transparent 45%),linear-gradient(155deg,#abd3db,#6b9ab8 65%,#335779)'};
  const custom=p.wallpaper==='custom'&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(p.wallpaper_image||'');
  el('home').style.backgroundImage=custom?'url('+JSON.stringify(p.wallpaper_image)+')':palettes[p.wallpaper]||palettes.forest;
  el('home').style.backgroundSize='cover';el('home').style.backgroundPosition='center';
}
export function mountAppearance({localReady,updated,toast}){
 const guard=fn=>async(...args)=>{try{await fn(...args);}catch(e){toast(e.message);}};
 let wallpaperImage='';
 async function refresh(){
    const local=await localReady,p=await local.api('/appearance');wallpaperImage=p.wallpaper_image||'';
    for(const [id,key,fallback] of [['theme','theme','light'],['font-size','font_size',16],['wallpaper','wallpaper','forest'],['icon-style','icon_style','soft'],['font-family','font_family','system'],['bubble-user','bubble_user','#e0eee8'],['bubble-assistant','bubble_assistant','#ffffff'],['bubble-radius','bubble_radius',16]])el(id).value=p[key]??fallback;
    el('motion').checked=p.motion!==false;applyAppearance(p);
 }
  el('wallpaper-file').onchange=guard(async()=>{const file=el('wallpaper-file').files[0];if(!file)return;if(file.size>2000000||!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('请选择不超过 2 MB 的 PNG、JPEG 或 WebP 图片');wallpaperImage=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('读取壁纸失败'));r.readAsDataURL(file);});el('wallpaper').value='custom';});
  el('appearance-form').onsubmit=guard(async e=>{e.preventDefault();const local=await localReady;const p={theme:el('theme').value,font_size:Number(el('font-size').value),wallpaper:el('wallpaper').value,wallpaper_image:wallpaperImage,icon_style:el('icon-style').value,font_family:el('font-family').value,bubble_user:el('bubble-user').value,bubble_assistant:el('bubble-assistant').value,bubble_radius:Number(el('bubble-radius').value),motion:el('motion').checked};if(p.wallpaper==='custom'&&!p.wallpaper_image)throw Error('请先上传壁纸');await local.api('/settings','PATCH',p);await updated();applyAppearance(p);toast('外观已保存');});
 return {refresh};
}
