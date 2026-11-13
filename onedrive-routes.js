'use strict';
const crypto = require('node:crypto');
const ROOT = 'Superior ProConnect';
const SCOPE = 'offline_access Files.ReadWrite User.Read';
function config() {
  const {MS_CLIENT_ID, MS_CLIENT_SECRET, MS_REDIRECT_URI, ONEDRIVE_ENCRYPTION_KEY} = process.env;
  if (![MS_CLIENT_ID,MS_CLIENT_SECRET,MS_REDIRECT_URI,ONEDRIVE_ENCRYPTION_KEY].every(Boolean)) return null;
  const key=Buffer.from(ONEDRIVE_ENCRYPTION_KEY,'hex');
  if(key.length!==32) return null;
  return {client:MS_CLIENT_ID,secret:MS_CLIENT_SECRET,redirect:MS_REDIRECT_URI,key};
}
function seal(value,key){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);const data=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64url')}
function unseal(value,key){const b=Buffer.from(value,'base64url'),dec=crypto.createDecipheriv('aes-256-gcm',key,b.subarray(0,12));dec.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([dec.update(b.subarray(28)),dec.final()]).toString())}
async function tokenRequest(cfg,params){const r=await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:cfg.client,client_secret:cfg.secret,...params})});if(!r.ok)throw Error('Microsoft authorization failed ('+r.status+')');return r.json()}
async function graph(token,url,method='GET',payload){const r=await fetch('https://graph.microsoft.com/v1.0'+url,{method,headers:{authorization:'Bearer '+token,...(payload?{'content-type':'application/json'}:{})},body:payload?JSON.stringify(payload):undefined});if(!r.ok){const err=new Error('OneDrive request failed ('+r.status+')');err.status=r.status;throw err}return r.status===204?{}:r.json()}
async function access(cfg,db,save){const d=db();if(!d.ownerOneDrive)throw Error('Connect Microsoft OneDrive first');let t=unseal(d.ownerOneDrive,cfg.key);if(Date.now()>t.expiresAt-120000){const next=await tokenRequest(cfg,{grant_type:'refresh_token',refresh_token:t.refresh_token,scope:SCOPE});t={access_token:next.access_token,refresh_token:next.refresh_token||t.refresh_token,expiresAt:Date.now()+next.expires_in*1000};d.ownerOneDrive=seal(t,cfg.key);save(d)}return t.access_token}
async function folder(token){const encoded=encodeURIComponent(ROOT);try{return await graph(token,'/me/drive/root:/'+encoded)}catch(e){if(e.status!==404)throw e;return graph(token,'/me/drive/root/children','POST',{name:ROOT,folder:{},'@microsoft.graph.conflictBehavior':'fail'})}}
module.exports=async function(req,res,{db,save,send,admin,body}){
 const url=new URL(req.url,'http://localhost'),route=url.pathname;
 if(!route.startsWith('/api/owner/onedrive/'))return false;
 const cfg=config();if(!cfg){send(res,503,{error:'Microsoft OneDrive integration is not configured'});return true}
 try {
  if(route==='/api/owner/onedrive/callback'&&req.method==='GET'){
   const state=url.searchParams.get('state')||'',parts=state.split('.'),signature=crypto.createHmac('sha256',cfg.key).update(parts[0]||'').digest('base64url');
   const cookies=Object.fromEntries((req.headers.cookie||'').split(';').map(v=>v.trim().split('=').map(decodeURIComponent)).filter(v=>v.length===2));
   if(parts.length!==2||parts[1].length!==signature.length||!crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(parts[1]))||cookies.onedrive_oauth_state!==state||!Number.isFinite(Number(parts[0]))||Date.now()-Number(parts[0])>600000||Date.now()<Number(parts[0]))throw Error('Expired or invalid authorization state');
   if(url.searchParams.get('error'))throw Error('Microsoft authorization was declined');
   const token=await tokenRequest(cfg,{grant_type:'authorization_code',code:url.searchParams.get('code')||'',redirect_uri:cfg.redirect,scope:SCOPE});
   const d=db();d.ownerOneDrive=seal({access_token:token.access_token,refresh_token:token.refresh_token,expiresAt:Date.now()+token.expires_in*1000},cfg.key);save(d);
   res.writeHead(302,{location:'/admin.html?onedrive=connected','cache-control':'no-store','set-cookie':'onedrive_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/api/owner/onedrive; Max-Age=0'});res.end();return true;
  }
  if(!admin(req)){send(res,401,{error:'Owner authorization required'});return true}
  if(route==='/api/owner/onedrive/connect'&&req.method==='GET'){
   const ts=String(Date.now()),sig=crypto.createHmac('sha256',cfg.key).update(ts).digest('base64url');
   const p=new URLSearchParams({client_id:cfg.client,response_type:'code',redirect_uri:cfg.redirect,response_mode:'query',scope:SCOPE,state:ts+'.'+sig,prompt:'select_account'});
   res.setHeader('set-cookie','onedrive_oauth_state='+encodeURIComponent(ts+'.'+sig)+'; HttpOnly; Secure; SameSite=Lax; Path=/api/owner/onedrive; Max-Age=600');
   send(res,200,{authorizationUrl:'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?'+p});return true;
  }
  if(route==='/api/owner/onedrive/status'&&req.method==='GET'){send(res,200,{connected:!!db().ownerOneDrive,configured:true});return true}
  if(route==='/api/owner/onedrive/upload'&&req.method==='POST'){
   const x=await body(req,110*1024),name=String(x.name||'');
   if(!/^[a-zA-Z0-9][a-zA-Z0-9_. -]{0,119}$/.test(name)||name==='.'||name==='..')throw Error('Invalid filename');
   if(typeof x.content!=='string'||Buffer.byteLength(x.content,'utf8')>100000)throw Error('File must be text under 100 KB');
   const token=await access(cfg,db,save),dir=await folder(token);
   const r=await fetch('https://graph.microsoft.com/v1.0/me/drive/items/'+encodeURIComponent(dir.id)+':/'+encodeURIComponent(name)+':/content',{method:'PUT',headers:{authorization:'Bearer '+token,'content-type':'text/plain; charset=utf-8'},body:x.content});
   if(!r.ok)throw Error('OneDrive upload failed ('+r.status+')');
   const item=await r.json();send(res,200,{ok:true,name:item.name,webUrl:item.webUrl});return true;
  }
  send(res,404,{error:'Unknown OneDrive action'});return true;
 }catch(e){send(res,e.status||400,{error:e.message});return true}
};
