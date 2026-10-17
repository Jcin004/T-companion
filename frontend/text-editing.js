// SPDX-License-Identifier: AGPL-3.0-only
// Keep Android long-press selection native; supply a desktop menu for embedded browsers.
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch { /* Try the selection-based copy path for older WebViews. */ }
  const active=document.activeElement,selection=window.getSelection();
  const ranges=Array.from({length:selection.rangeCount},(_,i)=>selection.getRangeAt(i).cloneRange());
  const field=document.createElement('textarea');
  field.value=text;field.readOnly=true;field.style.cssText='position:fixed;left:-9999px;top:0';
  document.body.append(field);field.select();
  let copied=false;
  try { copied=document.execCommand('copy'); }
  finally {
    field.remove();active?.focus({preventScroll:true});
    selection.removeAllRanges();for(const range of ranges)selection.addRange(range);
  }
  if(!copied)throw Error('无法访问剪贴板，请长按或选择文字后使用系统复制');
}

export function mountTextEditing({messages,input,toast}) {
  const menu=document.createElement('div');
  menu.className='text-menu';menu.hidden=true;menu.setAttribute('role','menu');menu.setAttribute('aria-label','文字操作');
  document.body.append(menu);
  let origin=null;
  const close=()=>{menu.hidden=true;};
  const action=(label,run,disabled=false)=>{
    const button=document.createElement('button');button.type='button';button.textContent=label;
    button.setAttribute('role','menuitem');button.disabled=disabled;
    button.onmousedown=e=>e.preventDefault();
    button.onclick=async()=>{close();try{await run();}catch(e){toast(e.message);}};
    menu.append(button);
  };
  function show(event) {
    // Do not suppress Android's selection handles or system copy/paste toolbar.
    if(event.pointerType==='touch'||/Android|iPhone|iPad/.test(navigator.userAgent))return;
    const editor=event.target===input;
    const bubble=event.target.closest('.bubble');
    if(!editor&&(!bubble||!messages.contains(bubble)))return;
    event.preventDefault();close();menu.replaceChildren();origin=editor?input:bubble;
    if(editor){
      const start=input.selectionStart,end=input.selectionEnd;
      const selected=input.value.slice(start,end);
      const restore=()=>{input.focus();input.setSelectionRange(start,end);};
      const replace=text=>{restore();input.setRangeText(text,start,end,'end');input.dispatchEvent(new Event('input',{bubbles:true}));};
      action('复制',async()=>{await copyText(selected);toast('已复制');},!selected);
      action('剪切',async()=>{await copyText(selected);replace('');toast('已剪切');},!selected||input.disabled||input.readOnly);
      action('粘贴',async()=>{
        if(!navigator.clipboard?.readText)throw Error('当前环境不允许读取剪贴板，请用 Ctrl+V 或手机长按粘贴');
        let text;
        try { text=await navigator.clipboard.readText(); }
        catch { throw Error('未获剪贴板权限，请用 Ctrl+V 或手机长按粘贴'); }
        if(input.maxLength>=0&&input.value.length-(end-start)+text.length>input.maxLength)throw Error('粘贴后超过输入字数上限');
        replace(text);
      },input.disabled||input.readOnly);
      action('全选',()=>{input.focus();input.select();},!input.value);
    }else{
      const selection=window.getSelection();
      const selected=selection.toString();
      if(selected&&messages.contains(selection.anchorNode)&&messages.contains(selection.focusNode)){
        action('复制所选文字',async()=>{await copyText(selected);toast('已复制');});
      }
      const content=bubble.closest('.message-body').firstElementChild;
      const text=content.innerText;
      action('复制整条消息',async()=>{await copyText(text);toast('已复制');});
      action('选择整条消息',()=>{
        const range=document.createRange();range.selectNodeContents(content);
        selection.removeAllRanges();selection.addRange(range);
      });
    }
    menu.hidden=false;
    menu.style.left=Math.max(4,Math.min(event.clientX,innerWidth-menu.offsetWidth-4))+'px';
    menu.style.top=Math.max(4,Math.min(event.clientY,innerHeight-menu.offsetHeight-4))+'px';
    menu.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
  }
  messages.addEventListener('contextmenu',show);input.addEventListener('contextmenu',show);
  document.addEventListener('pointerdown',e=>{if(!menu.contains(e.target))close();});
  document.addEventListener('scroll',close,true);window.addEventListener('resize',close);
  document.addEventListener('keydown',e=>{
    if(menu.hidden)return;
    if(e.key==='Escape'){close();origin?.focus();e.preventDefault();}
    else if(e.key==='Tab')close();
    else if(e.key==='ArrowDown'||e.key==='ArrowUp'){
      e.preventDefault();const choices=[...menu.querySelectorAll('button:not(:disabled)')];
      const index=choices.indexOf(document.activeElement),delta=e.key==='ArrowDown'?1:-1;
      choices[(index+delta+choices.length)%choices.length]?.focus();
    }
  });
}
