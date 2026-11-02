import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {orderedOutfitLayers} from '../frontend/outfit-layer-order.js';
import {copyOutfitFrame} from '../frontend/outfit-frame-copy.js';

test('LPC frame copy preserves rectangular output pixels and both drawing resolutions',()=>{
  for(const scale of [1,2]){
    const source={width:64*scale,height:96*scale},calls=[];
    copyOutfitFrame({drawImage(...args){calls.push(args);}},source,192*scale,96*scale);
    assert.equal(calls.length,6);
    for(const [image,sx,sy,sw,sh,dx,dy,dw,dh]of calls){
      assert.equal(image,source);assert.equal(sw,dw);assert.equal(sh,dh);
      assert.equal(dx-sx,192*scale);assert.equal(dy-sy,96*scale);
    }
  }
  assert.throws(()=>copyOutfitFrame({}, {width:64,height:64},0,0));
});
test('FashionSense relative ordering is direction-scoped and leaves default/input unchanged',()=>{
  const body={kind:'body'},hair={kind:'hair',draw_order:['behind','front','default','behind']},hat={kind:'hat'},layers=[body,hair,hat];
  assert.deepEqual(orderedOutfitLayers(layers,0),[hair,body,hat]);
  assert.deepEqual(orderedOutfitLayers(layers,1),[body,hat,hair]);
  assert.deepEqual(orderedOutfitLayers(layers,2),layers);assert.deepEqual(layers,[body,hair,hat]);
});
test('vendor source and licenses match immutable provenance records',()=>{
  for(const folder of ['lpc','fashion-sense']){
    const root='frontend/vendor/'+folder+'/',meta=JSON.parse(readFileSync(root+'PROVENANCE.json','utf8'));
    const data=readFileSync(meta.destination);
    assert.equal(createHash('sha256').update(data).digest('hex'),meta.excerpt_sha256||meta.sha256);
    if(!meta.excerpt_sha256)assert.equal(createHash('sha1').update(Buffer.from('blob '+data.length+'\0')).update(data).digest('hex'),meta.blob);
    assert.match(readFileSync(root+'LICENSE','utf8'),/GNU GENERAL PUBLIC LICENSE/);
  }
});
