// SPDX-License-Identifier: AGPL-3.0-only
// Browser files and Android's existing document adapter share one validation path.
export function bindCharacterImageInput(input,{onFile,error,guard=()=>()=>true}){
  input.onchange=async()=>{const file=input.files[0];input.value='';if(file)try{await onFile(file);}catch(e){error(e);}};
  const cap=globalThis.Capacitor;
  if(!(cap?.isNativePlatform?.()||cap?.getPlatform?.()==='android'))return;
  let picking=false;
  input.closest('label').addEventListener('click',async e=>{
    e.preventDefault();if(picking)return;
    picking=true;
    try{
      const valid=guard();
      const device=cap.Plugins?.TDevice||cap.registerPlugin('TDevice');
      const {dataURL}=await device.importFile({image:true});if(!valid())return;
      const match=dataURL.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);if(!match)throw Error('原生图片读取结果无效');
      const bytes=Uint8Array.from(atob(match[2]),s=>s.charCodeAt(0)),ext=match[1].split('/')[1];
      await onFile(new File([bytes],'图片.'+ext,{type:match[1]}));
    }catch(errorValue){if(errorValue.code!=='image_cancelled')error(errorValue);}
    finally{picking=false;}
  });
}

export async function readCharacterPicture(file,{sprite=false,frames=4,row_count=4}={}){
  if(!file||!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>4000000)throw Error('请选择不超过 4 MB 的 PNG、JPEG 或 WebP 图片');
  const src=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('图片读取失败'));r.readAsDataURL(file);});
  const image=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('图片无法解码'));i.src=src;});
  if(image.width*image.height>16000000)throw Error('图片尺寸过大，请缩小到 1600 万像素以内');
  if(sprite){if(image.width%frames||image.height%row_count)throw Error('图片宽高须能按填写的行列均匀分格');if(image.width>2048||image.height>2048||file.type!=='image/png'||src.length>1200000)throw Error('图集请使用不超过 2048 像素、900 KB 的 PNG');return src;}
  const c=document.createElement('canvas'),scale=Math.min(1,768/Math.max(image.width,image.height));c.width=Math.round(image.width*scale);c.height=Math.round(image.height*scale);c.getContext('2d').drawImage(image,0,0,c.width,c.height);const result=c.toDataURL('image/png');if(result.length>1200000)throw Error('图片内容过大，请缩小图片后上传');return result;
}
