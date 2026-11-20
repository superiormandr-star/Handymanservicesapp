import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createNetlifyRPC}=require('../netlify-storage');
const {createStore}=require('../persistent-store');
const key='cd'.repeat(32);
function seal(value){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);const bytes=Buffer.concat([c.update(JSON.stringify(value)),c.final()]);return JSON.stringify({v:1,iv:iv.toString('base64'),tag:c.getAuthTag().toString('base64'),data:bytes.toString('base64')});}
function fixture(){
 const objects=new Map();let revision=0,historyFailure=false;
 const getStore=options=>{
  assert.equal(options.consistency,'strong');
  return {
   async getWithMetadata(name,options){assert.equal(options.consistency,'strong');assert.equal(options.type,'text');return objects.get(name)||null;},
   async set(name,data,options){
    if(historyFailure&&name.includes('/history/'))throw Error('unavailable');
    const old=objects.get(name);
    if(options.onlyIfNew?Boolean(old):!options.onlyIfMatch||old?.etag!==options.onlyIfMatch)return {modified:false};
    const etag='revision-'+(++revision);objects.set(name,{data,etag});return {modified:true,etag};
   }
  };
 };
 const records={profiles:[],reviews:[],intake:[],documents:[],customers:[{id:'synthetic-customer'}],subscriptions:[{id:'synthetic-membership'}],unknownFutureRecords:[{id:'preserved'}]};
 objects.set('preview-test/state.json.enc',{etag:'initial',data:seal({records,oauth:{refresh:{token:'synthetic-private-refresh'}}})});
 const env={NETLIFY:'true',CONTEXT:'deploy-preview',DEPLOY_ID:'test',SPC_STORAGE_BACKEND:'netlify',BACKUP_ENCRYPTION_KEY:key,SPC_MIGRATION_VERIFIED:'true',SPC_WRITES_ENABLED:'true',SPC_PERSISTENCE_VERIFIED:'true'};
 const store=overrides=>createStore({env:{...env,...overrides},netlifyGetStore:getStore});
 async function run(s,handler,method='POST'){
  const res={writeHead(status){this.status=status;},end(bytes){this.body=JSON.parse(bytes.toString());}};
  await s.run({url:'/api/test',method},res,{},handler);return res;
 }
 return {objects,getStore,store,run,failHistory(){historyFailure=true;}};
}
test('Netlify encrypted records and OAuth survive fresh instances; simultaneous writes use atomic ETags',async()=>{
 const f=fixture();let count=0,release;const ready=new Promise(r=>release=r);
 const writer=s=>f.run(s,async(req,res)=>{if(++count===2)release();await ready;const state=s.context.getStore();state.value.records.documents.push({id:crypto.randomUUID()});state.dirty=true;res.end('{}');});
 assert.deepEqual((await Promise.all([writer(f.store()),writer(f.store())])).map(r=>r.status).sort(),[200,409]);
 const fresh=f.store();assert.equal((await f.run(fresh,async(req,res)=>{const value=fresh.context.getStore().value;assert.equal(value.records.documents.length,1);assert.equal(value.records.customers[0].id,'synthetic-customer');assert.equal(value.records.subscriptions[0].id,'synthetic-membership');assert.equal(value.records.unknownFutureRecords[0].id,'preserved');assert.equal(value.oauth.refresh.token,'synthetic-private-refresh');res.end('{}');},'GET')).status,200);
 assert.ok([...f.objects.keys()].some(k=>k.includes('/history/')));
 assert.ok([...f.objects.values()].every(v=>!v.data.includes('synthetic-private-refresh')));
});
test('Netlify previews cannot select production; migration, corruption and history failures fail closed',async()=>{
 const f=fixture(),deny=()=>assert.fail('handler must not execute');
 for(const env of [{SPC_STORAGE_NAMESPACE:'production'},{SPC_MIGRATION_VERIFIED:'false'},{SPC_PERSISTENCE_VERIFIED:'false'},{CONTEXT:'branch-deploy',SPC_STORAGE_NAMESPACE:'production'}])assert.equal((await f.run(f.store(env),deny)).status,503);
 const before=f.objects.get('preview-test/state.json.enc').data;
 f.failHistory();const s=f.store();assert.equal((await f.run(s,async(req,res)=>{s.context.getStore().dirty=true;res.end('{}');})).status,503);assert.equal(f.objects.get('preview-test/state.json.enc').data,before);
 f.objects.set('preview-test/state.json.enc',{etag:'corrupt',data:'invalid'});assert.equal((await f.run(f.store(),deny)).status,503);
 f.objects.clear();assert.equal((await f.run(f.store({SPC_ALLOW_INITIALIZE:'true'}),deny)).status,503);assert.equal(f.objects.size,0);
});
test('Netlify RPC rejects runtime initialization and stale revisions',async()=>{
 const f=fixture(),rpc=createNetlifyRPC({namespace:'preview-test',getStore:f.getStore});
 await assert.rejects(rpc('PUT',{revision:0,payload:'ciphertext'}),{status:409});
 await assert.rejects(rpc('PUT',{revision:'stale',payload:'ciphertext'}),{status:409});
 assert.equal(f.objects.size,1);
});
