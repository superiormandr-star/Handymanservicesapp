'use strict';
const crypto=require('node:crypto');
const {AsyncLocalStorage}=require('node:async_hooks');
const {recordEnvelope,openRecordEnvelope}=require('./record-envelope');
const {createNetlifyRPC}=require('./netlify-storage');
const context=new AsyncLocalStorage();
function createStore({env=process.env,request=fetch,blobSDK,netlifyGetStore}={}){
 const backend=env.SPC_STORAGE_BACKEND||'d1';
 const netlifyReady=env.SPC_NETLIFY_DATA_READY==='true'||env.SPC_MIGRATION_VERIFIED==='true';
 const netlifyPreview=Boolean(env.NETLIFY&&(env.CONTEXT||env.SPC_NETLIFY_CONTEXT)!=='production');
 const namespace=env.SPC_STORAGE_NAMESPACE||(netlifyPreview?'preview-'+String(env.DEPLOY_ID||'development').replace(/[^a-z0-9_-]/gi,'_').slice(0,60):env.VERCEL_ENV==='preview'?'preview-'+String(env.VERCEL_GIT_COMMIT_SHA||'development').slice(0,20):'production');
 const configured=backend==='blob'?env.BLOB_READ_WRITE_TOKEN:backend==='d1'?env.SPC_STORAGE_URL&&env.SPC_STORAGE_PRIVATE_KEY:backend==='netlify'&&env.NETLIFY&&netlifyReady;
 const enabled=Boolean(/^[a-f0-9]{64}$/i.test(env.BACKUP_ENCRYPTION_KEY||'')&&configured);
 const writesEnabled=env.SPC_WRITES_ENABLED==='true'&&env.SPC_PERSISTENCE_VERIFIED==='true';
 const isolated=(!env.VERCEL||env.VERCEL_ENV==='production'||namespace.startsWith('preview-'))&&(!netlifyPreview||namespace.startsWith('preview-'));
 const blobRPC=enabled&&backend==='blob'?require('./blob-storage').createBlobRPC({env,sdk:blobSDK,namespace}):null;
 const netlifyRPC=enabled&&backend==='netlify'?createNetlifyRPC({namespace,getStore:netlifyGetStore}):null;
 async function rpc(method,input){
  if(!enabled)throw Error('Persistent storage is not configured.');
  if(blobRPC)return blobRPC(method,input);
  if(netlifyRPC)return netlifyRPC(method,input);
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
  enabled,context,writesEnabled,backend,namespace,
  stateStore:{get:name=>context.getStore()?.value.oauth[name]||null,put(name,value){const state=context.getStore();if(!state)throw Error('Storage request context missing');state.value.oauth[name]=value;state.dirty=true;},remove(name){const state=context.getStore();delete state.value.oauth[name];state.dirty=true;}},
  async run(req,res,seed,handler){
   if(!enabled||!isolated){res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:'Persistent ProConnect storage is not configured. No records were changed.'}));return;}
   let state;
   try{
    const current=await rpc('GET');
    if(!current.payload&&(env.VERCEL||env.NETLIFY||env.SPC_ALLOW_INITIALIZE!=='true'))throw Error('Owner initialization or migration is required. Existing records have not been replaced.');
    state={revision:current.revision,value:current.payload?openRecordEnvelope(current.payload,env.BACKUP_ENCRYPTION_KEY):{records:structuredClone(seed),oauth:{}},dirty:!current.payload};
    const path=new URL(req.url||'/','https://localhost').pathname;
    const mutates=!['GET','HEAD'].includes(req.method||'GET')||path==='/api/cron/backup'||path==='/api/auth/microsoft/callback';
    if(mutates&&!writesEnabled){res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:'Record writes and backup connection changes are locked until durable persistence is verified.'}));return;}
    const headers={},chunks=[];
    const buffered={statusCode:200,setHeader(k,v){headers[k]=v;},writeHead(status,values={}){this.statusCode=status;Object.assign(headers,values);return this;},write(chunk){chunks.push(Buffer.from(chunk));return true;},end(chunk){if(chunk!==undefined)chunks.push(Buffer.from(chunk));}};
    await context.run(state,()=>handler(req,buffered));
    if(state.dirty&&buffered.statusCode<400){
     if(!writesEnabled){const error=Error('Record writes are locked.');error.status=503;throw error;}
     await rpc('PUT',{revision:state.revision,payload:recordEnvelope(state.value,env.BACKUP_ENCRYPTION_KEY)});
    }
    res.writeHead(buffered.statusCode,headers);res.end(Buffer.concat(chunks));
   }catch(error){res.writeHead(error.status||503,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:error.status===409?error.message:'Persistent storage could not complete the request. No success was recorded.'}));}
  }
 };
}
module.exports={createStore};
