'use strict';
const crypto=require('node:crypto');
const {AsyncLocalStorage}=require('node:async_hooks');
const {validateBackup}=require('./onedrive');
const context=new AsyncLocalStorage();
function createStore({env=process.env,request=fetch}={}){
 const enabled=Boolean(env.SPC_STORAGE_URL&&env.SPC_STORAGE_PRIVATE_KEY&&/^[a-f0-9]{64}$/i.test(env.BACKUP_ENCRYPTION_KEY||''));
 const namespace=env.SPC_STORAGE_NAMESPACE||(env.VERCEL_ENV==='preview'?'preview-'+String(env.VERCEL_GIT_COMMIT_SHA||'development').slice(0,20):'production');
 function seal(value){
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',Buffer.from(env.BACKUP_ENCRYPTION_KEY,'hex'),iv);
  const bytes=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);
  return JSON.stringify({v:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:bytes.toString('base64')});
 }
 function unseal(text){
  const value=JSON.parse(text);if(value.v!==1)throw Error('Unknown stored data version');
  const decipher=crypto.createDecipheriv('aes-256-gcm',Buffer.from(env.BACKUP_ENCRYPTION_KEY,'hex'),Buffer.from(value.iv,'base64'));
  decipher.setAuthTag(Buffer.from(value.tag,'base64'));
  const parsed=JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.data,'base64')),decipher.final()]));
  validateBackup(JSON.stringify(parsed.records));if(!parsed.oauth||typeof parsed.oauth!=='object')throw Error('Invalid OAuth store');return parsed;
 }
 async function rpc(method,input){
  if(!enabled)throw Error('Persistent storage is not configured.');
  const url=new URL('/state/'+namespace,env.SPC_STORAGE_URL);if(url.protocol!=='https:')throw Error('Storage must use HTTPS');
  const body=input?JSON.stringify(input):'',stamp=String(Date.now());
  const content=stamp+'\n'+method+'\n'+url.pathname+'\n'+crypto.createHash('sha256').update(body).digest('hex');
  const key=crypto.createPrivateKey({key:Buffer.from(env.SPC_STORAGE_PRIVATE_KEY,'base64'),format:'der',type:'pkcs8'});
  const signature=crypto.sign(null,Buffer.from(content),key).toString('base64url');
  const response=await request(url,{method,headers:{'x-spc-time':stamp,'x-spc-signature':signature,'content-type':'application/json'},body:input?body:undefined,signal:AbortSignal.timeout(20000),redirect:'error'});
  if(!response.ok){const error=Error(response.status===409?'Records changed during this request. Please retry.':'Persistent storage is temporarily unavailable.');error.status=response.status===409?409:503;throw error;}
  return response.json();
 }
 return {
  enabled,context,
  stateStore:{get:name=>context.getStore()?.value.oauth[name]||null,put(name,value){const state=context.getStore();if(!state)throw Error('Storage request context missing');state.value.oauth[name]=value;state.dirty=true;},remove(name){const state=context.getStore();delete state.value.oauth[name];state.dirty=true;}},
  async run(req,res,seed,handler){
   if(!enabled){res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:'Persistent ProConnect storage is not configured. No records were changed.'}));return;}
   let state;
   try{
    const current=await rpc('GET');
    if(!current.payload&&env.SPC_ALLOW_INITIALIZE!=='true')throw Error('Owner initialization or migration is required. Existing records have not been replaced.');
    state={revision:current.revision,value:current.payload?unseal(current.payload):{records:structuredClone(seed),oauth:{}},dirty:!current.payload};
    const headers={},chunks=[];
    const buffered={statusCode:200,setHeader(k,v){headers[k]=v;},writeHead(status,values={}){this.statusCode=status;Object.assign(headers,values);return this;},write(chunk){chunks.push(Buffer.from(chunk));return true;},end(chunk){if(chunk!==undefined)chunks.push(Buffer.from(chunk));}};
    await context.run(state,()=>handler(req,buffered));
    if(state.dirty&&buffered.statusCode<400)await rpc('PUT',{revision:state.revision,payload:seal(state.value)});
    res.writeHead(buffered.statusCode,headers);res.end(Buffer.concat(chunks));
   }catch(error){res.writeHead(error.status||503,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:error.status===409?error.message:'Persistent storage could not complete the request. No success was recorded.'}));}
  }
 };
}
module.exports={createStore};
