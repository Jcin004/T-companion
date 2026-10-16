// SPDX-License-Identifier: MIT
// Copyright (c) 2026 ChiYouyu
// Adapted from Serein, src/serein/recall/germany/memory_recall/fact_event_lexical_shadow.py
// Revision 180c94a54feb28283aa8af15a4f49a129aa8b397, blob fe6ddaf327249129b55a079cbf4caffd69e30c08.
// Ported 2026-10-16: _document_terms and search's weighted TF/BM25 scoring and match metadata.
// SQLite/jieba replaced with a rebuildable in-memory index and Chinese bigrams for standalone Android.
// Source quotes included; common-term gate relaxed for small personal collections.
// Full MIT notice: licenses/Serein-MIT.txt. No personal settings or narrative prompts imported.
const FIELD_WEIGHTS={title:1.5,body:1.0,source:0.75};
export function lexicalTerms(text){
  return (String(text).toLowerCase().match(/[a-z0-9_]{2,}|[\u3400-\u9fff]+/g)||[]).flatMap(s=>/^[\u3400-\u9fff]+$/.test(s)?Array.from({length:Math.max(0,s.length-1)},(_,i)=>s.slice(i,i+2)):[s]);
}
export class MemoryLexicalIndex {
  constructor(events){
    this.documents=[];this.postings=new Map();let total=0;
    for(const event of events){
      const fields={title:event.title,body:event.content,source:event.evidence.map(e=>e.quote).join('\n')},terms=new Map();let length=0;
      for(const [field,weight] of Object.entries(FIELD_WEIGHTS)){
        const counts=new Map();for(const term of lexicalTerms(fields[field])){counts.set(term,(counts.get(term)||0)+1);length++;}
        for(const [term,count] of counts){const row=terms.get(term)||{weighted_tf:0,fields:[]};row.weighted_tf+=count*weight;row.fields.push(field);terms.set(term,row);}
      }
      if(!length)continue;const doc={event,length,terms};this.documents.push(doc);total+=length;
      for(const [term,value] of terms){if(!this.postings.has(term))this.postings.set(term,[]);this.postings.get(term).push({doc,...value});}
    }
    this.averageLength=total/Math.max(1,this.documents.length);
  }
  search(query){
    const queryTerms=[...new Set(lexicalTerms(query))],n=this.documents.length,byItem=new Map(),k1=1.2,b=0.75;
    if(!n)return [];
    for(const term of queryTerms){
      const rows=this.postings.get(term)||[],df=rows.length;
      // Repeated generic terms in a larger collection are not enough to admit a candidate.
      const specific=n<10||df/n<=0.2&&(term.length>=3||df<=3);
      for(const row of rows){
        const tf=row.weighted_tf,docLength=row.doc.length;
        const idf=Math.log(1+(n-df+0.5)/(df+0.5));
        const denominator=tf+k1*(1-b+b*docLength/this.averageLength);
        const score=idf*(tf*(k1+1))/Math.max(denominator,1e-9);
        const current=byItem.get(row.doc.event.id)||{e:row.doc.event,score:0,matched_terms:[],specific_terms:[],matched_term_df:{}};
        current.score+=score;current.matched_terms.push(term);current.matched_term_df[term]=df;if(specific)current.specific_terms.push(term);byItem.set(row.doc.event.id,current);
      }
    }
    return [...byItem.values()].filter(r=>r.specific_terms.length).sort((a,b)=>b.score-a.score||b.specific_terms.length-a.specific_terms.length||b.e.updated_at.localeCompare(a.e.updated_at)||a.e.id.localeCompare(b.e.id));
  }
}

const cache=new WeakMap();
export function rankedMemories(memory,owner,query){
  if(!lexicalTerms(query).length)return [];
  const events=memory.events.filter(e=>e.owner_id===owner&&e.active);
  const signature=JSON.stringify(events.map(e=>[e.id,e.title,e.content,e.evidence,e.updated_at]));
  let owners=cache.get(memory);if(!owners){owners=new Map();cache.set(memory,owners);}
  let entry=owners.get(owner);if(!entry||entry.signature!==signature){entry={signature,index:new MemoryLexicalIndex(events)};owners.set(owner,entry);}
  return entry.index.search(query);
}
