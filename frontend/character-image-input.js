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
