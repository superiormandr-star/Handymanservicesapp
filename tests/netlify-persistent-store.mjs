import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createStore}=require('../netlify-persistent-store');
const seed={profiles:[],reviews:[],intake:[],documents:[]};
function response(){
 let status,body;
 return {writeHead(value){status=value;return this;},end(value){body=value?JSON.parse(String(value)):null;},get status(){return status;},get body(){return body;}};
}
function fakeDatabase(){
 let row=null,queries=[];
 return {
  get queries(){return queries;},
  sql(strings,...args){
   const q=strings.join('?');queries.push(q);
   if(q.startsWith('SELECT'))return Promise.resolve(row?[{revision:row.revision,payload:row.payload}]:[]);
   if(q.startsWith('INSERT')){if(!row)row={revision:0,payload:args[1]};return Promise.resolve([]);}
   if(q.startsWith('UPDATE')){
    if(!row||row.revision!==Number(args[2]))return Promise.resolve([]);
    row={revision:row.revision+1,payload:args[0]};
    return Promise.resolve([{revision:row.revision}]);
   }
   throw Error('unexpected query '+q);
  }
 };
}
test('Never reads or writes with missing encryption secret',async()=>{
 const store=createStore({env:{ADMIN_TOKEN:'a'.repeat(40)},getDatabase:()=>{throw Error('must not connect')}});
 const res=response();
 await store.run({url:'/api/health',method:'GET'},res,seed,()=>{throw Error('handler not allowed')});
 assert.equal(res.status,503);
 assert.match(res.body.error,/encryption key/);
});
test('Initializes a fresh database, reads state and blocks unverified writes',async()=>{
 const db=fakeDatabase(),env={ADMIN_TOKEN:'a'.repeat(40),BACKUP_ENCRYPTION_KEY:'f'.repeat(64),SPC_ALLOW_INITIALIZE:'true'};
 const store=createStore({env,getDatabase:()=>db});
 const health=response();
 await store.run({url:'/api/health',method:'GET'},health,seed,(_req,res)=>{
  assert.deepEqual(store.context.getStore().value.records,seed);
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true}));
 });
 assert.equal(health.status,200);
 assert.deepEqual(health.body,{ok:true});
 const post=response();
 await store.run({url:'/api/jobs',method:'POST'},post,seed,()=>{throw Error('write handler invoked')});
 assert.equal(post.status,503);
 assert.equal(db.queries.filter(x=>x.startsWith('UPDATE')).length,0);
});
test('Authorized writes persist encrypted records and survive a store re-instantiation',async()=>{
 const db=fakeDatabase(),env={ADMIN_TOKEN:'z'.repeat(40),BACKUP_ENCRYPTION_KEY:'a'.repeat(64),SPC_ALLOW_INITIALIZE:'true',SPC_PERSISTENCE_VERIFIED:'true',SPC_WRITES_ENABLED:'true'};
 const first=createStore({env,getDatabase:()=>db}),res=response();
 await first.run({url:'/api/jobs',method:'POST'},res,seed,(_req,r)=>{
  const state=first.context.getStore();state.value.records.reviews.push({id:'test-review'});state.dirty=true;
  r.writeHead(200,{'content-type':'application/json'});r.end('{"ok":true}');
 });
 assert.equal(res.status,200);
 assert.equal(db.queries.filter(x=>x.startsWith('UPDATE')).length,1);
 const second=createStore({env:{...env,SPC_ALLOW_INITIALIZE:'false'},getDatabase:()=>db});
 const after=response();
 await second.run({url:'/api/health',method:'GET'},after,seed,(_req,r)=>{
  assert.equal(second.context.getStore().value.records.reviews[0].id,'test-review');
  r.writeHead(200,{'content-type':'application/json'});r.end('{"ok":true}');
 });
 assert.equal(after.status,200);
});
