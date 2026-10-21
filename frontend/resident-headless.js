// SPDX-License-Identifier: AGPL-3.0-only
// Explicit synchronous reducer port for native QuickJS. No DOM, timer, fetch or credentials.
import * as rules from './resident-life-core.js';
import {parseModelObject} from './model-json.js';
export function command(data,operation,args={}){
  let result;
  const time=args.time;
  switch(operation){
    case 'attempt':result=rules.ensureLife(data).last_attempt={at:time.iso,origin:args.origin,status:args.status};break;
    case 'initialize':result=rules.ensureLife(data);break;
    case 'parse':result=parseModelObject(args.text).value;break;
    case 'begin':result=rules.beginLifeRun(data,args.id,time,args.origin);break;
    case 'next':result=rules.nextLifeJob(data,args.id,time);break;
    case 'prompt':result=rules.lifePrompt(data,args.job,args.memories||[]);break;
    case 'reserve':result=rules.reserveLifeRequest(data,args.id,time,args.prompt);break;
    case 'response':result=rules.recordLifeResponse(data,args.id,args.value,time);break;
    case 'apply':result=rules.applyLifeResponse(data,args.id,time);break;
    case 'fail':result=rules.failLifeJob(data,args.id,time,args.uncertain);break;
    case 'resume':result=rules.resumeLifeRun(data,args.id,time,args.skip);break;
    default:throw Error('Unknown resident operation');
  }
  return {data,result:result===undefined?null:result};
}
