'use strict';
// All live Superior ProConnect 2.0 records are encrypted in Netlify Database.
// There is no fallback to ephemeral filesystem storage.
const crypto=require('node:crypto');
const {AsyncLocalStorage}=require('node:async_hooks');
const {validateBackup}=require('./onedrive');
function createStore({env=process.env,getDatabase}={}){
 const context=new AsyncLocalStorage();
 const enabled=/^[0-9a-f]{64}$/i.test(env.BACKUP_ENCRYPTION_KEY||'');
 const writesEnabled=env.SPC_WRITES_ENABLED==='true'&&env.SPC_PERSISTENCE_VERIFIED==='true';
 const key=enabled?Buffer.from(env.BACKUP_ENCRYPTION_KEY,'hex'):null;
 let promise;
 async function database(){
  if(!promise)promise=Promise.resolve().then(async()=>{
   if(getDatabase)return getDatabase();
   const module=await import('@netlify/database');
   return module.getDatabase();
  });
  return promise;
 }
 function seal(value){
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  const bytes=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);
  return JSON.stringify({v:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:bytes.toString('base64')});
 }
 function unseal(text){
  const box=JSON.parse(text);if(box.v!==1)throw Error('Unknown stored data version');
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(box.iv,'base64'));
  decipher.setAuthTag(Buffer.from(box.tag,'base64'));
  const state=JSON.parse(Buffer.concat([decipher.update(Buffer.from(box.data,'base64')),decipher.final()]));
  validateBackup(JSON.stringify(state.records));
  if(!state.oauth||typeof state.oauth!=='object')throw Error('Invalid OAuth store');
  return state;
 }
 function error(res,status,message){
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
  res.end(JSON.stringify({error:message}));
 }
 const stateStore={
  get:name=>context.getStore()?.value.oauth[name]||null,
  put(name,value){const state=context.getStore();if(!state)throw Error('Request context missing');state.value.oauth[name]=value;state.dirty=true;},
  remove(name){const state=context.getStore();if(!state)throw Error('Request context missing');delete state.value.oauth[name];state.dirty=true;}
 };
 async function run(req,res,seed,handler){
  if(!enabled)return error(res,503,'Netlify Database encryption key is not configured. Customer data unchanged.');
  if(!env.ADMIN_TOKEN||env.ADMIN_TOKEN.length<32)return error(res,503,'Owner token is not configured. Customer data unchanged.');
  try{
   const db=await database(),name='fresh-production';
   let rows=await db.sql`SELECT revision,payload FROM spc_state WHERE id=${name}`;
   if(!rows.length){
    if(env.SPC_ALLOW_INITIALIZE!=='true')return error(res,503,'Empty database initialization is disabled. No records created.');
    const initial=seal({records:structuredClone(seed),oauth:{}});
    await db.sql`INSERT INTO spc_state (id,revision,payload) VALUES (${name},0,${initial}) ON CONFLICT (id) DO NOTHING`;
    rows=await db.sql`SELECT revision,payload FROM spc_state WHERE id=${name}`;
   }
   if(!rows.length)throw Error('Data initialization missing');
   const state={revision:Number(rows[0].revision),value:unseal(rows[0].payload),dirty:false};
   const route=new URL(req.url||'/','https://localhost').pathname;
   const mutates=!['GET','HEAD'].includes(req.method||'GET')||route==='/api/cron/backup'||route==='/api/auth/microsoft/callback';
   if(mutates&&!writesEnabled)return error(res,503,'Writes are locked pending database persistence verification.');
   const headers={},chunks=[];
   const buffered={
    statusCode:200,
    setHeader(k,v){headers[k]=v;},
    writeHead(status,values={}){this.statusCode=status;Object.assign(headers,values);return this;},
    write(chunk){chunks.push(Buffer.from(chunk));return true;},
    end(chunk){if(chunk!==undefined)chunks.push(Buffer.from(chunk));}
   };
   await context.run(state,()=>handler(req,buffered));
   if(state.dirty&&buffered.statusCode<400){
    if(!writesEnabled)return error(res,503,'Writes are locked.');
    const encrypted=seal(state.value);
    const result=await db.sql`UPDATE spc_state SET revision=revision+1,payload=${encrypted},updated_at=NOW() WHERE id=${name} AND revision=${state.revision} RETURNING revision`;
    if(result.length!==1)return error(res,409,'Records changed during this request. Please retry.');
   }
   res.writeHead(buffered.statusCode,headers);res.end(Buffer.concat(chunks));
  }catch(e){
   console.error('Netlify DB request failed:',e?.name||'Error');
   return error(res,503,'Persistent database request failed. No success recorded.');
  }
 }
 return {enabled,context,writesEnabled,backend:'netlify-postgres',stateStore,run};
}
module.exports={createStore};
