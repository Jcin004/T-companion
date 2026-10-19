import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const digest=(algorithm,bytes)=>createHash(algorithm).update(bytes).digest('hex');

test('embedded OB, RapidFuzz, jieba and runtime license files match fixed provenance',async()=>{
  const ob=JSON.parse(await readFile('vendor/python/ombre/PROVENANCE.json','utf8'));
  assert.equal(ob.commit,'115d831d979bf67efc7150f976e2cb34c333c935');
  for(const [name,expected] of Object.entries(ob.files)){
    const content=await readFile('vendor/python/ombre/'+name);
    assert.equal(digest('sha256',content),expected.sha256,name);
    assert.equal(digest('sha1',Buffer.concat([Buffer.from('blob '+content.length+'\0'),content])),expected.git_blob,name);
  }
  for(const name of ['rapidfuzz','jieba']){
    const manifest=JSON.parse(await readFile('vendor/'+name+'-distribution/PROVENANCE.json','utf8'));
    for(const [file,expected] of Object.entries(manifest.files)){
      const path=file.startsWith(name+'/')?'vendor/python/'+file:'vendor/'+name+'-distribution/'+file;
      assert.equal(digest('sha256',await readFile(path)),expected,file);
    }
  }
  const runtime=JSON.parse(await readFile('vendor/runtime-licenses/PROVENANCE.json','utf8'));
  for(const [file,expected] of Object.entries(runtime.files))assert.equal(digest('sha256',await readFile('vendor/runtime-licenses/'+file)),expected,file);
});
