// SPDX-License-Identifier: AGPL-3.0-only
// Isolate mutable JSON containers without serializing immutable image strings.
export function jsonSnapshot(value){
  const stack=new Set();
  function visit(v){
    if(v===null||typeof v==='string'||typeof v==='boolean')return v;
    if(typeof v==='number')return Number.isFinite(v)?v:null;
    if(typeof v!=='object'){
      if(typeof v==='bigint')throw TypeError('JSON cannot contain BigInt');
      return undefined;
    }
    if(stack.has(v))throw TypeError('JSON cannot contain circular data');
    if(!Array.isArray(v)&&![Object.prototype,null].includes(Object.getPrototypeOf(v)))return JSON.parse(JSON.stringify(v));
    stack.add(v);
    let result;
    if(Array.isArray(v))result=Array.from(v,item=>visit(item)??null);
    else{
      result={};
      for(const k of Object.keys(v)){
        const item=visit(v[k]);
        if(item!==undefined)Object.defineProperty(result,k,{value:item,writable:true,enumerable:true,configurable:true});
      }
    }
    stack.delete(v);return result;
  }
  const result=visit(value);if(result===undefined)throw TypeError('A JSON value is required');return result;
}
