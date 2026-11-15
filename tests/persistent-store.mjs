import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import worker from '../storage-worker.mjs';
const {createStore}=createRequire(import.meta.url)('../persistent-store');
test('signed encrypted storage persists records and tokens, rejects concurrent overwrites and unauthenticated access',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../storage-schema.sql',import.meta.url),'utf8'));
 const DB={prepare(text){return {bind(...args){return {async first(){return sql.prepare(text).get(...args)||null;},async run(){return {meta:{changes:Number(sql.prepare(text).run(...args).changes)}};}};}};},async batch(statements){sql.exec('BEGIN');try{const values=[];for(const statement of statements)values.push(await statement.run());sql.exec('COMMIT');return values;}catch(error){sql.exec('ROLLBACK');throw error;}}};
 const pair=crypto.generateKeyPairSync('ed25519');
 const publicKey=pair.publicKey.export({format:'der',type:'spki'}).toString('base64');
 const env={SPC_STORAGE_URL:'https://storage.example',SPC_STORAGE_PRIVATE_KEY:pair.privateKey.export({format:'der',type:'pkcs8'}).toString('base64'),BACKUP_ENCRYPTION_KEY:'ab'.repeat(32),SPC_ALLOW_INITIALIZE:'true'};
 const request=(url,options)=>worker.fetch(new Request(url,options),{DB,STORAGE_PUBLIC_KEY:publicKey});
 const store=createStore({env,request}),seed={profiles:[],reviews:[],intake:[],documents:[]};
 const response=()=>({writeHead(status){this.status=status;},end(body){this.body=JSON.parse(body.toString());}});
 async function run(handler){const res=response();await store.run({},res,seed,handler);return res;}
 let r=await run(async(req,res)=>{const state=store.context.getStore();state.value.records.intake.push({id:'preserved-application'});store.stateStore.put('tokens',{refresh_token:'private-test-refresh'});state.dirty=true;res.end('{}');});assert.equal(r.status,200);
 r=await run(async(req,res)=>{const state=store.context.getStore();assert.equal(state.value.records.intake[0].id,'preserved-application');assert.equal(store.stateStore.get('tokens').refresh_token,'private-test-refresh');res.end('{}');});assert.equal(r.status,200);
 const ciphertext=sql.prepare('SELECT payload FROM spc_state').get().payload;assert.equal(ciphertext.includes('private-test-refresh'),false);assert.equal(ciphertext.includes('preserved-application'),false);
 const snapshots=[];let release;const both=new Promise(r=>release=r);
 async function writer(id){return run(async(req,res)=>{const state=store.context.getStore();snapshots.push(id);if(snapshots.length===2)release();await both;state.value.records.documents.push({id});state.dirty=true;res.end('{}');});}
 const results=await Promise.all([writer('one'),writer('two')]);assert.deepEqual(results.map(v=>v.status).sort(),[200,409]);
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM spc_history').get().n,1);
 const denied=await worker.fetch(new Request('https://storage.example/state/production'),{DB,STORAGE_PUBLIC_KEY:publicKey});assert.equal(denied.status,401);
 const before=sql.prepare('SELECT payload FROM spc_state').get().payload;
 r=await run(async(req,res)=>{const state=store.context.getStore();state.value.records.intake=[];state.dirty=true;res.writeHead(400);res.end('{"error":"test"}');});assert.equal(r.status,400);assert.equal(sql.prepare('SELECT payload FROM spc_state').get().payload,before);
 const disabled=createStore({env:{}}),res=response();await disabled.run({},res,seed,()=>assert.fail('must not start a local database'));assert.equal(res.status,503);
 sql.close();
});
