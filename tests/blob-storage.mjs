import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{createStore}=require('../persistent-store');
const key='bc'.repeat(32),path='superior-proconnect/preview-test/state.json.enc';
function seal(value){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);const data=Buffer.concat([c.update(JSON.stringify(value)),c.final()]);return JSON.stringify({v:1,iv:iv.toString('base64'),tag:c.getAuthTag().toString('base64'),data:data.toString('base64')});}
function fixture(){
 const objects=new Map();let revision=0;
 class BlobPreconditionFailedError extends Error{}
 const sdk={BlobPreconditionFailedError,async head(name){const item=objects.get(name);if(!item)throw Error('missing');return {etag:item.etag};},async get(name,options){assert.equal(options.access,'private');assert.equal(options.useCache,false);const found=objects.get(name);return found?{statusCode:200,blob:{etag:'download-representation-'+found.etag},stream:new Response(found.data).body}:null;},async put(name,data,options){assert.equal(options.access,'private');const old=objects.get(name);if((options.ifMatch&&old?.etag!==options.ifMatch)||(!options.allowOverwrite&&old))throw new BlobPreconditionFailedError();const etag='etag-'+(++revision);objects.set(name,{data,etag});return {etag};}};
 const env={VERCEL:'1',VERCEL_ENV:'preview',SPC_STORAGE_BACKEND:'blob',BLOB_READ_WRITE_TOKEN:'synthetic-token',BACKUP_ENCRYPTION_KEY:key,SPC_STORAGE_NAMESPACE:'preview-test',SPC_WRITES_ENABLED:'true',SPC_PERSISTENCE_VERIFIED:'true'};
 function store(overrides={}){return createStore({env:{...env,...overrides},blobSDK:sdk});}
 const records={profiles:[],reviews:[],intake:[],documents:[],customers:[{id:'synthetic-customer'}],subscriptions:[{id:'synthetic-subscription'}]};
 objects.set(path,{etag:'initial',data:seal({records,oauth:{}})});
 async function run(s,method,handler){const res={writeHead(status){this.status=status;},end(text){this.body=JSON.parse(text.toString());}};await s.run({url:'/api/command/estimates',method},res,{},handler);return res;}
 return {objects,store,run};
}
test('private Blob preserves unknown collections across fresh instances and rejects concurrent overwrites',async()=>{
 const {objects,store,run}=fixture();
 const writer=async(s,id)=>run(s,'POST',async(req,res)=>{const state=s.context.getStore();state.value.records.documents.push({id});state.dirty=true;res.end('{"ok":true}');});
 assert.equal((await writer(store(),'synthetic-estimate')).status,200);
 const fresh=store();assert.equal((await run(fresh,'GET',async(req,res)=>{const r=fresh.context.getStore().value.records;assert.equal(r.documents[0].id,'synthetic-estimate');assert.equal(r.customers[0].id,'synthetic-customer');assert.equal(r.subscriptions[0].id,'synthetic-subscription');res.end('{}');})).status,200);
 let release;const ready=new Promise(r=>release=r);let count=0;
 const race=s=>run(s,'POST',async(req,res)=>{if(++count===2)release();await ready;const state=s.context.getStore();state.value.records.documents.push({id:crypto.randomUUID()});state.dirty=true;res.end('{}');});
 assert.deepEqual((await Promise.all([race(store()),race(store())])).map(r=>r.status).sort(),[200,409]);
 assert.ok([...objects.keys()].some(k=>k.includes('/history/')));
 assert.ok([...objects.values()].every(v=>!v.data.includes('synthetic-estimate')));
});
test('missing/corrupt storage, unverified writes and production namespaces in preview fail closed',async()=>{
 const {objects,store,run}=fixture();const before=objects.get(path).data;
 const deny=()=>assert.fail('handler must not execute');
 assert.equal((await run(store({SPC_PERSISTENCE_VERIFIED:'false'}),'POST',deny)).status,503);
 assert.equal((await run(store({SPC_STORAGE_NAMESPACE:'production'}),'GET',deny)).status,503);
 assert.equal(objects.get(path).data,before);
 objects.set(path,{etag:'bad',data:'invalid'});assert.equal((await run(store(),'GET',deny)).status,503);
 objects.clear();assert.equal((await run(store({SPC_ALLOW_INITIALIZE:'true'}),'GET',deny)).status,503);assert.equal(objects.size,0);
});
