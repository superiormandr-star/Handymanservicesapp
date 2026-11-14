'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function validateBackup(text) {
 const data = JSON.parse(text);
 for (const key of ['profiles','reviews','intake','documents']) {
  if (!Array.isArray(data[key])) throw Error('Invalid backup: missing '+key);
 }
 for (const key of ['leads','proAccess','estimateRequests']) {
  if (data[key] !== undefined && !Array.isArray(data[key])) throw Error('Invalid backup: '+key);
 }
 return data;
}

// Tokens use the durable encrypted state adapter on Vercel.
function createOneDrive({env=process.env, request=fetch, now=()=>Date.now(), readSnapshot, stateStore=null}) {
 const origin = env.APP_ORIGIN;
 const redirectUri = origin ? new URL('/api/auth/microsoft/callback', origin).href : null;
 const key = env.BACKUP_ENCRYPTION_KEY;
 const directory = env.ONEDRIVE_STATE_DIR;
 const clientSecret = env.MICROSOFT_CLIENT_SECRET || env.microsoft_client_secret;
 const enabled = Boolean(origin && env.MICROSOFT_CLIENT_ID && env.MICROSOFT_TENANT_ID && clientSecret && /^[a-f0-9]{64}$/i.test(key||'') && (stateStore || (directory && !env.VERCEL)));
 let busy = false;
 const scopes = 'offline_access Files.ReadWrite.AppFolder';
 function requireConfig() {
  if (!enabled) throw Error('Microsoft backup requires configured credentials and a persistent state directory; Vercel requires a durable storage adapter.');
  const parsed = new URL(origin);
  if (parsed.origin !== origin || (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost','127.0.0.1'].includes(parsed.hostname)))) throw Error('APP_ORIGIN must be an exact HTTPS origin.');
  if (!/^[a-zA-Z0-9.-]+$/.test(env.MICROSOFT_TENANT_ID)) throw Error('Invalid Microsoft tenant identifier.');
 }
 function seal(value) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);
  return JSON.stringify({version:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:encrypted.toString('base64')});
 }
 function unseal(text) {
  const value = JSON.parse(text);
  if (value.version !== 1) throw Error('Unsupported encrypted backup.');
  const decipher = crypto.createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),Buffer.from(value.iv,'base64'));
  decipher.setAuthTag(Buffer.from(value.tag,'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.data,'base64')),decipher.final()]).toString());
 }
 function file(name) { return path.join(directory,name+'.json'); }
 function put(name,value) {
  if(stateStore)return stateStore.put(name,value);
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const dest=file(name), temp=dest+'.'+crypto.randomUUID()+'.tmp';
  fs.writeFileSync(temp,seal(value),{mode:0o600,flag:'wx'});fs.renameSync(temp,dest);
 }
 function get(name) {if(stateStore)return stateStore.get(name);try{return unseal(fs.readFileSync(file(name),'utf8'))}catch(error){if(error.code==='ENOENT')return null;throw error}}
 async function token(parameters,authority=env.MICROSOFT_TENANT_ID) {
  const result=await request('https://login.microsoftonline.com/'+encodeURIComponent(authority)+'/oauth2/v2.0/token',{
   method:'POST',signal:AbortSignal.timeout(30000),headers:{'content-type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams({client_id:env.MICROSOFT_CLIENT_ID,client_secret:clientSecret,redirect_uri:redirectUri,scope:scopes,...parameters})
  });
  if(!result.ok){const detail=await result.json().catch(()=>({})),error=Error('Microsoft token exchange failed ('+result.status+'). Reconnect the Microsoft account.');error.authReason='token_exchange_failed';error.microsoftCode=Array.isArray(detail.error_codes)?detail.error_codes.find(Number.isSafeInteger):undefined;throw error;}
  const value=await result.json(), stored=get('tokens'),previous=parameters.grant_type==='refresh_token'&&(stored?.authority||env.MICROSOFT_TENANT_ID)===authority?stored:null;
  if(!value.access_token || !(value.refresh_token||previous?.refresh_token))throw Error('Microsoft did not return the required authorization tokens.');
  put('tokens',{access_token:value.access_token,refresh_token:value.refresh_token||previous.refresh_token,authority,expiresAt:now()+Number(value.expires_in||3600)*1000});
  return value.access_token;
 }
 async function accessToken() {
  const value=get('tokens');if(!value)throw Error('Connect the owner Microsoft account first.');
  if(value.expiresAt>now()+60000)return value.access_token;
  return token({grant_type:'refresh_token',refresh_token:value.refresh_token},value.authority||env.MICROSOFT_TENANT_ID);
 }
 async function graph(resource, options={}) {
  const response=await request('https://graph.microsoft.com/v1.0/me/drive/'+resource,{
   ...options,signal:AbortSignal.timeout(30000),headers:{...options.headers,authorization:'Bearer '+await accessToken()}
  });
  if(!response.ok)throw Error('OneDrive request failed ('+response.status+').');
  return response;
 }
 async function exclusive(action) {
  if(busy)throw Error('A Microsoft backup operation is already running.');
  busy=true;try{return await action()}finally{busy=false}
 }
 const api = {
  status() {return {configured:enabled,connected:enabled&&Boolean(get('tokens')),redirectUri,automaticBackups:enabled&&Boolean(get('tokens'))&&(Boolean(env.VERCEL&&env.CRON_SECRET)||Number(env.ONEDRIVE_BACKUP_INTERVAL_MINUTES)>=5),lastBackup:enabled?get('last-backup'):null};},
  async diagnose() {
   requireConfig();const access=await accessToken(),checks=[];
   for(const resource of ['','special/approot']){
    const response=await request('https://graph.microsoft.com/v1.0/me/drive/'+resource,{headers:{authorization:'Bearer '+access},signal:AbortSignal.timeout(25000)});
    const check={resource:resource||'drive',status:response.status};
    if(!response.ok){const value=await response.json().catch(()=>({}));check.code=String(value.error?.code||'unknown').slice(0,100);check.reason=String(value.error?.message||'').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[account]').slice(0,350);}
    checks.push(check);
   }return {checks};
  },
  connect(accountType='business') {
   requireConfig();if(!['personal','business'].includes(accountType))throw Error('Choose a personal or business Microsoft account.');const authority=accountType==='personal'?'consumers':env.MICROSOFT_TENANT_ID;const state=crypto.randomBytes(32).toString('hex'),verifier=crypto.randomBytes(48).toString('base64url');
   const pending=Object.fromEntries(Object.entries(get('pending-authorizations')||{}).filter(([,value])=>value.expiresAt>now()).slice(-9));pending[state]={state,verifier,authority,expiresAt:now()+600000};put('pending-authorizations',pending);
   const url=new URL('https://login.microsoftonline.com/'+encodeURIComponent(authority)+'/oauth2/v2.0/authorize');
   url.search=new URLSearchParams({client_id:env.MICROSOFT_CLIENT_ID,response_type:'code',redirect_uri:redirectUri,response_mode:'query',scope:scopes,state,code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();
   return url.href;
  },
  async callback(state,code,providerError=null) {
   requireConfig();const pendingRequests=get('pending-authorizations')||{},legacy=get('pending');
   const pending=typeof state==='string'&&/^[a-f0-9]{64}$/.test(state)?pendingRequests[state]||(legacy?.state===state?legacy:null):null;
   if(!pending||pending.expiresAt<now()||!crypto.timingSafeEqual(Buffer.from(state),Buffer.from(pending.state))){const error=Error('Invalid or expired Microsoft authorization state.');error.authReason='invalid_or_expired_link';throw error;}
   if(pendingRequests[state]){delete pendingRequests[state];put('pending-authorizations',pendingRequests);}
   else if(stateStore)stateStore.remove('pending');else fs.unlinkSync(file('pending'));
   if(providerError?.error){const error=Error('Microsoft authorization was canceled or denied.');error.authReason=['access_denied','invalid_request','unauthorized_client','login_required','interaction_required','consent_required'].includes(providerError.error)?providerError.error:'provider_error';const match=String(providerError.description||'').match(/AADSTS(\d{4,10})/);if(match)error.microsoftCode=Number(match[1]);throw error;}
   if(!code){const error=Error('Microsoft authorization was canceled or denied.');error.authReason='missing_authorization_code';throw error;}
   return exclusive(async()=>{await token({grant_type:'authorization_code',code,code_verifier:pending.verifier},pending.authority||env.MICROSOFT_TENANT_ID);});
  },
  async backup() {
   requireConfig();return exclusive(async()=>{
    const text=readSnapshot();validateBackup(text);
    const name='superior-proconnect-'+new Date(now()).toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID()+'.json.enc';
    const contents=seal({version:1,createdAt:new Date(now()).toISOString(),sha256:crypto.createHash('sha256').update(text).digest('hex'),snapshot:text});
    const result=await graph('special/approot:/'+name+':/content',{method:'PUT',headers:{'content-type':'application/octet-stream'},body:contents});
    const item=await result.json();
    if(!item.id)throw Error('OneDrive did not confirm an uploaded item.');
    const downloaded=await (await graph('items/'+encodeURIComponent(item.id)+'/content')).text();
    const digest=crypto.createHash('sha256').update(contents).digest('hex');
    if(crypto.createHash('sha256').update(downloaded).digest('hex')!==digest)throw Error('OneDrive upload verification failed: downloaded checksum does not match.');
    put('last-backup',{id:item.id,name,createdAt:new Date(now()).toISOString(),sha256:crypto.createHash('sha256').update(text).digest('hex')});
    return {id:item.id,name,verified:true,sha256:digest};
   });
  },
  async list() {
   requireConfig();return exclusive(async()=>{
    const result=await (await graph('special/approot/children?$top=200&$select=id,name,size,lastModifiedDateTime')).json();
    return {backups:(result.value||[]).filter(item=>/^superior-proconnect-.*\.json\.enc$/.test(item.name)),hasMore:Boolean(result['@odata.nextLink'])};
   });
  },
  async recover(id) {
   requireConfig();if(!/^[a-zA-Z0-9!_-]{1,200}$/.test(id||''))throw Error('Invalid backup ID.');
   return exclusive(async()=>{
    // Resolve within the app folder, never an arbitrary user-controlled URL.
    const listing=await (await graph('special/approot/children?$top=200&$select=id,name')).json();
    if(!(listing.value||[]).some(item=>item.id===id&&/^superior-proconnect-.*\.json\.enc$/.test(item.name)))throw Error('Backup not found in the application folder.');
    const response=await graph('items/'+encodeURIComponent(id)+'/content');
    const backup=unseal(await response.text());
    if(backup.version!==1||typeof backup.snapshot!=='string'||crypto.createHash('sha256').update(backup.snapshot).digest('hex')!==backup.sha256)throw Error('Backup integrity check failed.');
    validateBackup(backup.snapshot);return backup.snapshot;
   });
  },
  schedule(onError=()=>{}) {
   const minutes=Number(env.ONEDRIVE_BACKUP_INTERVAL_MINUTES);
   if(env.VERCEL||!enabled||!Number.isFinite(minutes)||minutes<5||minutes>10080)return null;
   const timer=setInterval(()=>api.backup().catch(onError),minutes*60000);timer.unref();return timer;
  }
 };
 return api;
}
module.exports={createOneDrive,validateBackup};
