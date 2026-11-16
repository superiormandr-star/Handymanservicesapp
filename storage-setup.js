'use strict';
const crypto=require('node:crypto');
const {validateBackup}=require('./onedrive');
// One-time empty-store setup. It never replaces an object or creates business records.
async function storageSetup(req,res,{env=process.env,sdk=require('@vercel/blob'),send}){
 if(env.SPC_SETUP_ENABLED!=='true')return send(res,404,{error:'Not found'});
 const expected=env.SPC_SETUP_TOKEN||'',provided=req.headers['x-spc-setup-token'];
 if(expected.length<32||typeof provided!=='string'||Buffer.byteLength(expected)!==Buffer.byteLength(provided)||!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(provided)))return send(res,401,{error:'Setup authorization required'});
 const namespace=env.SPC_STORAGE_NAMESPACE||(env.VERCEL_ENV==='production'?'production':'');
 if(env.SPC_STORAGE_BACKEND!=='blob'||(!/^preview-[a-zA-Z0-9_-]{1,60}$/.test(namespace)&&!(namespace==='production'&&env.VERCEL_ENV==='production')))return send(res,503,{error:'A valid private storage namespace is required.'});
 if(!/^[a-f0-9]{64}$/i.test(env.BACKUP_ENCRYPTION_KEY||''))return send(res,503,{error:'Storage encryption is not configured.'});
 const pathname=`superior-proconnect/${namespace}/state.json.enc`,options={access:'private',token:env.BLOB_READ_WRITE_TOKEN};
 if(env.SPC_BLOB_PATH&&env.SPC_BLOB_PATH!==pathname)return send(res,503,{error:'Custom storage paths cannot be initialized.'});
 const route=new URL(req.url,'https://localhost').pathname;
 try{
  if(route==='/api/setup/status'&&req.method==='GET'){
   const stored=await sdk.get(pathname,{...options,useCache:false});
   if(!stored)return send(res,404,{error:'Primary storage has not been initialized.'});
   const envelope=JSON.parse(await new Response(stored.stream).text());
   if(envelope.v!==1)throw Error('Unsupported stored state');
   const decipher=crypto.createDecipheriv('aes-256-gcm',Buffer.from(env.BACKUP_ENCRYPTION_KEY,'hex'),Buffer.from(envelope.iv,'base64'));decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
   const plaintext=Buffer.concat([decipher.update(Buffer.from(envelope.data,'base64')),decipher.final()]);const value=JSON.parse(plaintext);validateBackup(JSON.stringify(value.records));
   const counts=Object.fromEntries(Object.entries(value.records).filter(([,v])=>Array.isArray(v)).map(([k,v])=>[k,v.length]));
   return send(res,200,{ok:true,namespace,counts,ownerAuthenticationConfigured:Boolean(env.ADMIN_TOKEN),microsoftBackupConfigured:Boolean(env.APP_ORIGIN&&env.MICROSOFT_CLIENT_ID&&env.MICROSOFT_TENANT_ID&&(env.MICROSOFT_CLIENT_SECRET||env.microsoft_client_secret)),sha256:crypto.createHash('sha256').update(plaintext).digest('hex'),etag:stored.blob.etag});
  }
  if(route!=='/api/setup/initialize'||req.method!=='POST')return send(res,405,{error:'Method not allowed'});
  const records={profiles:[],reviews:[],intake:[],documents:[],customers:[],subscriptions:[],leads:[],proAccess:[],estimateRequests:[]};validateBackup(JSON.stringify(records));
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',Buffer.from(env.BACKUP_ENCRYPTION_KEY,'hex'),iv),bytes=Buffer.concat([cipher.update(JSON.stringify({records,oauth:{}})),cipher.final()]);
  const payload=JSON.stringify({v:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:bytes.toString('base64')});
  await sdk.put(pathname,payload,{...options,addRandomSuffix:false,allowOverwrite:false,contentType:'application/octet-stream'});
  return send(res,201,{ok:true,namespace,empty:true});
 }catch{return send(res,409,{error:'Storage setup did not complete. Existing objects were not overwritten.'});}
}
module.exports={storageSetup};
