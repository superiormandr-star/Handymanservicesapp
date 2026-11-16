import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {previewFixture}=createRequire(import.meta.url)('../preview-fixture');
test('QA bootstrap cannot initialize production, overwrite an object, or select production paths',async()=>{
 let writes=0;const sdk={async put(path,body,options){assert.match(path,/^superior-proconnect\/preview-qa\//);assert.equal(options.allowOverwrite,false);assert.equal(options.access,'private');assert.equal(body.includes('Synthetic QA Customer'),false);if(writes++)throw Error('exists');}};
 const base={VERCEL_ENV:'preview',SPC_PREVIEW_FIXTURE_ENABLED:'true',SPC_STORAGE_NAMESPACE:'preview-qa',SPC_STORAGE_BACKEND:'blob',BACKUP_ENCRYPTION_KEY:'ab'.repeat(32)};
 const run=async env=>{const res={};await previewFixture({method:'POST'},res,{env,sdk,send:(r,status,body)=>Object.assign(r,{status,body})});return res;};
 assert.equal((await run({...base,VERCEL_ENV:'production'})).status,404);
 assert.equal((await run({...base,SPC_STORAGE_NAMESPACE:'production'})).status,503);
 assert.equal((await run({...base,SPC_BLOB_PATH:'superior-proconnect/production/state.json.enc'})).status,503);
 assert.equal(writes,0);
 assert.equal((await run(base)).status,201);assert.equal((await run(base)).status,409);
});
