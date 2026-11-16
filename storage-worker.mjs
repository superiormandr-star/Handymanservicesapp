// Separate ProConnect storage service. Only ciphertext reaches D1.
const encoder=new TextEncoder();
const decode=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const json=(status,value)=>Response.json(value,{status,headers:{'cache-control':'no-store'}});
export default {
 async fetch(req,env){
  try{
   const url=new URL(req.url),match=url.pathname.match(/^\/state\/([a-zA-Z0-9_-]{1,80})$/);
   if(!match||!['GET','PUT'].includes(req.method))return json(404,{error:'Not found'});
   const stamp=req.headers.get('x-spc-time'),signature=req.headers.get('x-spc-signature');
   if(!stamp||Math.abs(Date.now()-Number(stamp))>120000||!signature)return json(401,{error:'Unauthorized'});
   const body=req.method==='PUT'?await req.text():'';
   if(encoder.encode(body).length>4*1024*1024)return json(413,{error:'Payload too large'});
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(body))),b=>b.toString(16).padStart(2,'0')).join('');
   const key=await crypto.subtle.importKey('spki',decode(env.STORAGE_PUBLIC_KEY),{name:'Ed25519'},false,['verify']);
   const valid=await crypto.subtle.verify({name:'Ed25519'},key,decode(signature),encoder.encode(stamp+'\n'+req.method+'\n'+url.pathname+'\n'+digest));
   if(!valid)return json(401,{error:'Unauthorized'});
   const namespace=match[1];
   if(req.method==='GET'){
    const row=await env.DB.prepare('SELECT revision,payload FROM spc_state WHERE namespace=?').bind(namespace).first();
    return json(200,row||{revision:0,payload:null});
   }
   const input=JSON.parse(body);
   if(!Number.isSafeInteger(input.revision)||input.revision<0||typeof input.payload!=='string')return json(400,{error:'Invalid state update'});
   if(input.revision===0){
    const result=await env.DB.prepare('INSERT INTO spc_state(namespace,revision,payload) VALUES(?,1,?) ON CONFLICT DO NOTHING').bind(namespace,input.payload).run();
    return result.meta.changes?json(200,{revision:1}):json(409,{error:'Revision conflict'});
   }
   const results=await env.DB.batch([
    env.DB.prepare('INSERT INTO spc_history(namespace,revision,payload) SELECT namespace,revision,payload FROM spc_state WHERE namespace=? AND revision=? ON CONFLICT DO NOTHING').bind(namespace,input.revision),
    env.DB.prepare('UPDATE spc_state SET payload=?,revision=revision+1 WHERE namespace=? AND revision=?').bind(input.payload,namespace,input.revision)
   ]);
   return results[1].meta.changes?json(200,{revision:input.revision+1}):json(409,{error:'Revision conflict'});
  }catch{return json(503,{error:'Storage unavailable'});}
 }
};
