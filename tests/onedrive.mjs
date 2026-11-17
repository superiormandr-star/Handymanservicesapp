import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const {createOneDrive}=createRequire(import.meta.url)('../onedrive');
test('Microsoft state, PKCE, encrypted backup, refresh and authenticated recovery',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'proconnect-ms-'));
 const snapshot=JSON.stringify({profiles:[{id:'original'}],reviews:[],intake:[],documents:[{id:'estimate-existing'}],jobs:[{id:'job-existing'}],custom:{preserved:true}});
 let clock=1000000,uploaded,refreshes=0,fail=false,corruptDownload=false;
 const env={APP_ORIGIN:'https://superior-proconnect.vercel.app',MICROSOFT_CLIENT_ID:'test-client',microsoft_client_secret:'private-test-secret',MICROSOFT_TENANT_ID:'test-tenant',BACKUP_ENCRYPTION_KEY:'ab'.repeat(32),ONEDRIVE_STATE_DIR:dir};
 const request=async(url,options)=>{
  if(url.includes('/token')){
   assert.equal(options.body.get('client_secret'),'private-test-secret');
   if(options.body.get('grant_type')==='authorization_code')assert.ok(options.body.get('code_verifier'));
   else refreshes++;
   return Response.json({access_token:'private-access',refresh_token:'private-refresh',expires_in:120});
  }
  assert.equal(options.headers.authorization,'Bearer private-access');
  if(fail)return new Response('',{status:503});
  if(options.method==='PUT'){uploaded=options.body;assert.ok(!uploaded.includes('estimate-existing'));return Response.json({id:'backup-id'});}
  if(url.includes('/children'))return Response.json({value:[{id:'backup-id',name:'superior-proconnect-test.json.enc'},{id:'unrelated',name:'unrelated.txt'}]});
  return new Response(corruptDownload?uploaded+' ':uploaded);
 };
 const api=createOneDrive({env,request,now:()=>clock,readSnapshot:()=>snapshot});
 try{
  assert.equal(api.status().connected,false);
  const auth=new URL(api.connect());assert.equal(auth.searchParams.get('redirect_uri'),'https://superior-proconnect.vercel.app/api/auth/microsoft/callback');assert.equal(auth.searchParams.get('code_challenge_method'),'S256');
  await assert.rejects(api.callback('bad','code'),/state/);
  await api.callback(auth.searchParams.get('state'),'code');
  await assert.rejects(api.callback(auth.searchParams.get('state'),'code'),/state/);
  assert.equal(api.status().connected,true);
  assert.ok(!readFileSync(join(dir,'tokens.json'),'utf8').includes('private-refresh'));
  const verified=await api.backup();assert.equal((await api.list()).backups.length,1);
  assert.equal(verified.verified,true);
  assert.equal(api.status().lastVerifiedBackup.verifiedAt,verified.verifiedAt);
  corruptDownload=true;
  clock+=1000;
  await assert.rejects(api.backup(),/checksum does not match/);
  assert.equal(api.status().lastVerifiedBackup.verifiedAt,verified.verifiedAt);
  corruptDownload=false;
  assert.equal(await api.recover('backup-id'),snapshot);
  await assert.rejects(api.recover('unrelated'),/not found/);
  clock+=120000;await api.backup();assert.equal(refreshes,1);
  uploaded=uploaded.replace('"version":1','"version":2');await assert.rejects(api.recover('backup-id'),/Unsupported/);
  fail=true;await assert.rejects(api.backup(),/503/);
  const blocked=createOneDrive({env:{...env,VERCEL:'1'},request,readSnapshot:()=>snapshot});
  assert.equal(blocked.status().configured,false);assert.throws(()=>blocked.connect(),/durable/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});

test('personal OneDrive consent and token refresh use the same consumer authority',async()=>{
 const values=new Map(),calls=[];let uploaded;
 const stateStore={get:k=>values.get(k),put:(k,v)=>values.set(k,v),remove:k=>values.delete(k)};
 const env={VERCEL:'1',APP_ORIGIN:'https://superior-proconnect.vercel.app',MICROSOFT_CLIENT_ID:'app',MICROSOFT_TENANT_ID:'business-directory',microsoft_client_secret:'test-only',BACKUP_ENCRYPTION_KEY:'cd'.repeat(32)};
 const request=async(url,options)=>{
  if(url.includes('/token')){calls.push(url);assert.ok(url.includes('/consumers/'));return Response.json({access_token:'test-access',refresh_token:'test-refresh',expires_in:calls.length===1?1:3600});}
  if(options.method==='PUT'){uploaded=options.body;return Response.json({id:'test-file'});}
  return new Response(uploaded);
 };
 const api=createOneDrive({env,request,stateStore,readSnapshot:()=>JSON.stringify({profiles:[],reviews:[],intake:[],documents:[]})});
 assert.throws(()=>api.connect('untrusted-directory'),/Choose/);
 const url=new URL(api.connect('personal'));assert.ok(url.pathname.startsWith('/consumers/'));
 await api.callback(url.searchParams.get('state'),'test-code');
 assert.equal(values.get('tokens').authority,'consumers');await api.backup();
 assert.equal(calls.length,2);assert.equal(values.get('tokens').authority,'consumers');
});
test('new consent links preserve earlier pending links and provider errors expose only safe codes',async()=>{
 const values=new Map(),stateStore={get:k=>values.get(k),put:(k,v)=>values.set(k,v),remove:k=>values.delete(k)};
 const env={VERCEL:'1',APP_ORIGIN:'https://superior-proconnect.vercel.app',MICROSOFT_CLIENT_ID:'app',MICROSOFT_TENANT_ID:'directory',microsoft_client_secret:'test-only',BACKUP_ENCRYPTION_KEY:'ef'.repeat(32)};
 const api=createOneDrive({env,stateStore,readSnapshot:()=>'',request:async()=>Response.json({access_token:'test-access',refresh_token:'test-refresh',expires_in:3600})});
 const first=new URL(api.connect('personal')),second=new URL(api.connect('personal'));
 await api.callback(first.searchParams.get('state'),'first-code');await api.callback(second.searchParams.get('state'),'second-code');
 await assert.rejects(api.callback(first.searchParams.get('state'),'replayed-code'),error=>error.authReason==='invalid_or_expired_link');
 const denied=new URL(api.connect('personal'));
 await assert.rejects(api.callback(denied.searchParams.get('state'),null,{error:'unauthorized_client',description:'AADSTS9002332: private provider diagnostics'}),error=>error.authReason==='unauthorized_client'&&error.microsoftCode===9002332&&!error.message.includes('private provider diagnostics'));
});
test('broader OneDrive scope requires explicit selection and remains bound to consent on refresh',async()=>{
 const values=new Map(),calls=[];let uploaded;
 const stateStore={get:k=>values.get(k),put:(k,v)=>values.set(k,v),remove:k=>values.delete(k)};
 const env={VERCEL:'1',APP_ORIGIN:'https://superior-proconnect.vercel.app',MICROSOFT_CLIENT_ID:'app',MICROSOFT_TENANT_ID:'directory',microsoft_client_secret:'test-only',BACKUP_ENCRYPTION_KEY:'12'.repeat(32)};
 const request=async(url,options)=>{
  if(url.includes('/token')){calls.push(options.body.get('scope'));return Response.json({access_token:'test-access',refresh_token:'test-refresh',expires_in:calls.length===1?1:3600});}
  if(url.endsWith('/special/approot')||url.includes('/root:/'))return new Response('',{status:404});
  if(url.endsWith('/root/children')){assert.equal(options.method,'POST');const body=JSON.parse(options.body);assert.equal(body.name,'Superior ProConnect Backups');assert.equal(body['@microsoft.graph.conflictBehavior'],'fail');return Response.json({id:'dedicated-folder',folder:{}});}
  if(url.endsWith('/items/dedicated-folder'))return Response.json({id:'dedicated-folder',folder:{}});
  if(url.includes('/items/dedicated-folder/children?'))return Response.json({value:[{id:'test-backup',name:'superior-proconnect-test.json.enc'}]});
  assert.ok(url.includes('/me/drive/items/'));
  if(options.method==='PUT'){uploaded=options.body;return Response.json({id:'test-backup'});}
  return new Response(uploaded);
 };
 const api=createOneDrive({env,stateStore,request,readSnapshot:()=>JSON.stringify({profiles:[],reviews:[],intake:[],documents:[]})});
 assert.equal(new URL(api.connect('personal')).searchParams.get('scope'),'offline_access Files.ReadWrite.AppFolder');
 assert.throws(()=>api.connect('personal','Files.ReadWrite.All'),/approved/);
 const chosen=new URL(api.connect('personal','files'));assert.equal(chosen.searchParams.get('scope'),'offline_access Files.ReadWrite');
 await api.callback(chosen.searchParams.get('state'),'test-code');await api.backup();
 assert.deepEqual(calls,['offline_access Files.ReadWrite','offline_access Files.ReadWrite']);
 assert.equal(values.get('tokens').scopes,'offline_access Files.ReadWrite');
 assert.equal((await api.list()).backups.length,1);assert.equal(await api.recover('test-backup'),JSON.stringify({profiles:[],reviews:[],intake:[],documents:[]}));
});


test('authorization diagnostics expose only allowlisted codes and redact provider messages',async()=>{
 const {describeAuthorizationError}=createRequire(import.meta.url)('../microsoft-authorization-error');
 const raw=Object.assign(new Error('private-client-secret private-auth-code owner@example.com'),{authReason:'token_exchange_failed',microsoftCode:7000215});
 const report=describeAuthorizationError(raw);assert.equal(report.reason,'token_exchange_failed');assert.equal(report.microsoftCode,7000215);assert.match(report.error,/rejected the app client secret/);assert.ok(!JSON.stringify(report).includes('private-'));assert.ok(!JSON.stringify(report).includes('@'));
 assert.deepEqual(describeAuthorizationError({authReason:'private-value',microsoftCode:'private-secret'}),{error:'The Microsoft connection could not be completed. Start a new connection from Backups. (authorization_failed)',reason:'authorization_failed'});
 const values=new Map(),stateStore={get:k=>values.get(k),put:(k,v)=>values.set(k,v),remove:k=>values.delete(k)};
 const env={VERCEL:'1',APP_ORIGIN:'https://superior-proconnect.vercel.app',MICROSOFT_CLIENT_ID:'app',MICROSOFT_TENANT_ID:'directory',microsoft_client_secret:'test-only',BACKUP_ENCRYPTION_KEY:'34'.repeat(32)};
 const api=createOneDrive({env,stateStore,request:async()=>Response.json({error:'invalid_client',error_description:'private-client-secret',error_codes:[7000215]},{status:401}),readSnapshot:()=>''});
 const auth=new URL(api.connect('personal'));
 await assert.rejects(api.callback(auth.searchParams.get('state'),'test-code'),error=>{assert.equal(describeAuthorizationError(error).microsoftCode,7000215);return true;});assert.equal(api.status().connected,false);
});
