
const spc2Json=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const spc2Hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(b=>b.toString(16).padStart(2,'0')).join('');
const spc2Error=(message,status=400)=>spc2Json({error:message},status);
async function spc2JobApi(request,env,url){
 const route=url.pathname;
 if(route==='/api/jobs'&&request.method==='POST'){
  if(Number(request.headers.get('content-length')||0)>1250000)return spc2Error('Job submission is too large',413);
  let data;try{data=await request.json()}catch{return spc2Error('Invalid JSON')}
  const str=(key,max)=>String(data[key]||'').trim().slice(0,max);
  if(data.website)return spc2Error('Submission rejected');
  const industry=str('industry',20),title=str('title',100),description=str('description',2200),city=str('city',100),category=str('category',70),name=str('name',100),email=str('email',180),phone=str('phone',40),address=str('address',180),bidLimit=Number(data.bidLimit);
  if(!['construction','automotive'].includes(industry)||title.length<5||description.length<20||city.length<2||name.length<2||(!email&&!phone)||!Number.isInteger(bidLimit)||bidLimit<1||bidLimit>3||data.consent!==true||data.rulesAccepted!==true)return spc2Error('Complete the required job details, contact information and agreements');
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return spc2Error('Invalid email');
  const attachments=Array.isArray(data.attachments)?data.attachments:[];
  if(attachments.length>3)return spc2Error('Maximum three attachments');
  const validated=[];
  for(const a of attachments){
   const filename=String(a.name||'').replace(/[^\w.() -]/g,'_').slice(0,90);
   const mime=/\.pdf$/i.test(filename)?'application/pdf':/\.png$/i.test(filename)?'image/png':/\.jpe?g$/i.test(filename)?'image/jpeg':'';
   if(!mime||typeof a.bytes!=='string'||a.bytes.length>350000||!/^[A-Za-z0-9+/]*={0,2}$/.test(a.bytes))return spc2Error('Only JPG, PNG and PDF attachments up to 256 KB are accepted');
   const binary=atob(a.bytes);
   if(binary.length>262144)return spc2Error('Attachment exceeds 256 KB');
   const magic=mime==='application/pdf'?binary.startsWith('%PDF-'):mime==='image/png'?binary.startsWith('\x89PNG\r
\x1a
'):binary.startsWith('\xff\xd8\xff');
   if(!magic)return spc2Error('Attachment content does not match file type');
   validated.push({id:crypto.randomUUID(),filename,mime,bytes:a.bytes});
  }
  const jobId=crypto.randomUUID(),customerKey=Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join(''),keyHash=await spc2Hash(customerKey),now=new Date().toISOString();
  const privateDetails=JSON.stringify({name,email,phone,address});
  const statements=[env.DB.prepare('INSERT INTO spc2_jobs(id,industry,title,description,category,city,customer_private,customer_key_hash,bid_limit,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(jobId,industry,title,description,category,city,privateDetails,keyHash,bidLimit,'open',now,now),...validated.map(a=>env.DB.prepare('INSERT INTO spc2_job_attachments(id,job_id,file_name,content_type,bytes_base64,created_at) VALUES(?,?,?,?,?,?)').bind(a.id,jobId,a.filename,a.mime,a.bytes,now))];
  try{await env.DB.batch(statements)}catch{return spc2Error('Unable to save job. Please retry.',503)}
  return spc2Json({jobId,customerKey},201);
 }
 const m=route.match(/^\/api\/jobs\/([0-9a-f-]{36})(?:\/(close|fourth))?$/);
 const f=route.match(/^\/api\/jobs\/([0-9a-f-]{36})\/attachments\/([0-9a-f-]{36})$/);
 if(m||f){
  const id=(m||f)[1],key=request.headers.get('x-customer-key')||request.headers.get('x-job-key')||url.searchParams.get('key')||'';
  if(!/^[a-f0-9]{64}$/.test(key))return spc2Error('Private job key required',401);
  const job=await env.DB.prepare('SELECT * FROM spc2_jobs WHERE id=?').bind(id).first();
  if(!job||await spc2Hash(key)!==job.customer_key_hash)return spc2Error('Job not found or access denied',404);
  if(f&&request.method==='GET'){
   const file=await env.DB.prepare('SELECT * FROM spc2_job_attachments WHERE job_id=? AND id=?').bind(id,f[2]).first();
   if(!file)return spc2Error('Attachment not found',404);
   const bytes=Uint8Array.from(atob(file.bytes_base64),c=>c.charCodeAt(0));
   return new Response(bytes,{headers:{'content-type':file.content_type,'content-disposition':'attachment; filename="job-file"','cache-control':'private, no-store','x-content-type-options':'nosniff'}});
  }
  if(m&&request.method==='GET'&&!m[2]){
   const attachments=await env.DB.prepare('SELECT id,file_name,content_type FROM spc2_job_attachments WHERE job_id=?').bind(id).all();
   return spc2Json({id:job.id,title:job.title,city:job.city,industry:job.industry,status:job.status,bidLimit:job.bid_limit,fourthApproved:false,receivedEstimates:0,remainingSlots:job.bid_limit,bids:[],messages:[],selectedProfessional:null,attachments:(attachments.results||[]).map(a=>({id:a.id,name:a.file_name,url:'/api/jobs/'+id+'/attachments/'+a.id+'?key='+encodeURIComponent(key)}))});
  }
  if(m&&m[2]==='close'&&request.method==='POST'){await env.DB.prepare("UPDATE spc2_jobs SET status='closed',updated_at=? WHERE id=? AND status='open'").bind(new Date().toISOString(),id).run();return spc2Json({ok:true})}
  return spc2Error('This action is not available yet',503);
 }
 return null;
}

// Cloudflare Workers entry point for Superior ProConnect 2.0.
// Fail closed until the existing Node.js routes have been ported and tested.
// Never return fake success for job submissions, payments or membership activation.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/jobs')) { const result = await spc2JobApi(request,env,url); if(result)return result; }
    if (url.pathname === '/api/health') {
      try {
        await env.DB.prepare('SELECT 1 AS ok').first();
        return Response.json({ok: true, platform: 'cloudflare-workers', database: 'connected',
          apiReady: false, paymentsReady: false, persistenceTestsPassed: false},
          {headers: {'cache-control':'no-store'}});
      } catch {
        return Response.json({ok: false, platform: 'cloudflare-workers', database: 'unavailable',
          apiReady: false, paymentsReady: false}, {status: 503});
      }
    }
    if (url.pathname.startsWith('/api/')) {
      return Response.json({error:'Cloudflare API migration in progress; submissions and payments disabled to protect records.'},
        {status:503, headers:{'cache-control':'no-store'}});
    }
    if (/^\/logos\/Superior_(?:ProConnect_Master|Construction_Network|Automotive_Network)\.jpg$/.test(url.pathname)) {
      return env.ASSETS.fetch(request);
    }
    return env.ASSETS.fetch(request);
  }
};
