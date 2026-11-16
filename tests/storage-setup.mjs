import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {storageSetup}=createRequire(import.meta.url)('../storage-setup');
test('one-time empty database setup needs dedicated authorization and cannot overwrite records',async()=>{
 const token='synthetic-setup-token-'.repeat(3),objects=new Map();
 const env={SPC_SETUP_ENABLED:'true',SPC_SETUP_TOKEN:token,VERCEL_ENV:'production',SPC_STORAGE_BACKEND:'blob',BACKUP_ENCRYPTION_KEY:'bc'.repeat(32)};
 const sdk={async put(name,text,options){assert.equal(options.access,'private');assert.equal(options.allowOverwrite,false);if(objects.has(name))throw Error('exists');objects.set(name,text);},async get(name){const text=objects.get(name);return text?{blob:{etag:'synthetic-etag'},stream:new Response(text).body}:null;}};
 async function run(url,method='POST',headers={'x-spc-setup-token':token},overrides={}){const res={};await storageSetup({url,method,headers},res,{env:{...env,...overrides},sdk,send:(r,status,body)=>Object.assign(r,{status,body})});return res;}
 assert.equal((await run('/api/setup/initialize','POST',{})).status,401);assert.equal(objects.size,0);
 assert.equal((await run('/api/setup/initialize','POST',undefined,{SPC_SETUP_ENABLED:'false'})).status,404);
 assert.equal((await run('/api/setup/initialize','POST',undefined,{VERCEL_ENV:'preview',SPC_STORAGE_NAMESPACE:'production'})).status,503);
 assert.equal((await run('/api/setup/initialize')).status,201);
 const before=await run('/api/setup/status','GET');assert.equal(before.status,200);assert.ok(Object.values(before.body.counts).every(v=>v===0));
 assert.equal((await run('/api/setup/initialize')).status,409);
 assert.equal((await run('/api/setup/status','GET')).body.sha256,before.body.sha256);
});
