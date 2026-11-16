import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {createOneDrive}=require('../onedrive.js');

function fixture(scope, request){
 const data=new Map();
 const stateStore={get:key=>data.get(key)||null,put:(key,value)=>data.set(key,value),remove:key=>data.delete(key)};
 const env={
  APP_ORIGIN:'https://example.test',
  MICROSOFT_CLIENT_ID:'test-client',
  MICROSOFT_TENANT_ID:'test-tenant',
  MICROSOFT_CLIENT_SECRET:'test-secret',
  BACKUP_ENCRYPTION_KEY:'1'.repeat(64)
 };
 stateStore.put('tokens',{
  access_token:'synthetic-access-token',
  refresh_token:'synthetic-refresh-token',
  authority:'consumers',
  scopes:'offline_access '+scope,
  expiresAt:Date.now()+3_600_000
 });
 const readSnapshot=()=>JSON.stringify({profiles:[],reviews:[],intake:[],documents:[]});
 return {api:createOneDrive({env,stateStore,readSnapshot,request}),data};
}
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
const graphPath=url=>new URL(url).pathname.split('/me/drive/')[1];

test('restricted Apps-folder 404 does not touch ordinary drive folders or upload',async()=>{
 const calls=[];
 const {api}=fixture('Files.ReadWrite.AppFolder',async(url,options={})=>{
  const path=graphPath(url);calls.push([path,options.method||'GET']);
  if(path==='')return json({id:'drive-one'});
  if(path==='special/approot')return json({error:{code:'itemNotFound',message:'App folder not found'}},404);
  if(path?.startsWith('special/approot/children'))return json({error:{code:'itemNotFound'}},404);
  throw Error('Unexpected Graph route: '+path);
 });
 await assert.rejects(api.list(),/OneDrive request failed \(404\)/);
 const diag=await api.diagnose();
 assert.deepEqual(diag.checks.map(x=>x.status),[200,404]);
 assert.equal(api.status().connected,true);
 assert.equal(calls.some(([path])=>path.includes('root/children')),false);
 assert.equal(calls.some(([,method])=>method!=='GET'),false);
});

test('approved wider Files.ReadWrite mode uses dedicated folder and verifies encrypted backup without Apps-folder calls',async()=>{
 const calls=[];let uploaded='';
 const {api,data}=fixture('Files.ReadWrite',async(url,options={})=>{
  const path=graphPath(url),method=options.method||'GET';
  calls.push([path,method]);
  if(path==='root:/Superior%20ProConnect%20Backups'&&method==='GET')
   return json({error:{code:'itemNotFound'}},404);
  if(path==='root/children'&&method==='POST')
   return json({id:'dedicated-folder',name:'Superior ProConnect Backups',folder:{}},201);
  if(path==='items/dedicated-folder')return json({id:'dedicated-folder',folder:{}});
  if(path?.startsWith('items/dedicated-folder/children?'))return json({value:[]});
  if(path?.startsWith('items/dedicated-folder:/')&&path.endsWith(':/content')&&method==='PUT'){
   uploaded=options.body;
   return json({id:'encrypted-backup-1'});
  }
  if(path==='items/encrypted-backup-1/content'&&method==='GET')
   return new Response(uploaded,{status:200,headers:{'content-type':'text/plain'}});
  throw Error('Unexpected Graph route: '+path+' ('+method+')');
 });
 const listing=await api.list();
 assert.deepEqual(listing,{backups:[],hasMore:false});
 assert.equal(data.get('backup-folder').id,'dedicated-folder');
 const verified=await api.backup();
 assert.equal(verified.verified,true);
 assert.ok(uploaded.length>150);
 assert.equal(api.status().lastVerifiedBackup.id,'encrypted-backup-1');
 assert.ok(calls.some(([path,method])=>path==='root/children'&&method==='POST'));
 assert.equal(calls.some(([path])=>path.includes('special/approot')),false);
});
