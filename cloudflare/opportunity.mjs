// Independent owner-only opportunity pipeline. No consumer records or automatic outreach.
const reply=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
const fail=(error,status=400)=>reply({error},status);
const clean=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
const statuses=['new','contacted','demo_booked','proposal','client','closed'];
const industries=['construction','automotive','cleaning','other'];
async function authorized(request,env){
 const key=env.OPPORTUNITY_OWNER_TOKEN;
 if(typeof key!=='string'||key.length<32)return false;
 const supplied=request.headers.get('authorization')||'';
 if(!supplied.startsWith('Bearer ')||supplied.length>1024)return false;
 const digest=async s=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
 const a=await digest(supplied.slice(7)),b=await digest(key);
 let diff=0;for(let n=0;n<a.length;n++)diff|=a[n]^b[n];return diff===0;
}
export function priority(record){
 return (record.inbound===true?35:0)+(record.bookingGap===true?35:0)+(record.highValue===true?30:0);
}
export async function opportunityApi(request,env){
 const path=new URL(request.url).pathname;
 if(!path.startsWith('/api/opportunity/'))return null;
 if(!await authorized(request,env))return fail('Owner access required',401);
 const origin=request.headers.get('origin');
 if(origin&&origin!==new URL(request.url).origin)return fail('Invalid request origin',403);
 if(!env.DB)return fail('Storage unavailable',503);
 try{
 if(path==='/api/opportunity/overview'&&request.method==='GET'){
 const queries={
  jobs:"SELECT industry,status,COUNT(*) AS count FROM spc2_jobs GROUP BY industry,status",
  members:"SELECT industry,tier,status,payment_status,COUNT(*) AS count FROM spc2_applications GROUP BY industry,tier,status,payment_status",
  estimates:"SELECT industry,estimate_status,COUNT(*) AS count FROM spc2_estimate_records GROUP BY industry,estimate_status",
  payments:"SELECT kind,currency,status,COUNT(*) AS count,SUM(amount_cents) AS amount_cents FROM spc2_payment_events WHERE verified=1 GROUP BY kind,currency,status",
  recentJobs:"SELECT id,industry,title,city,status,created_at FROM spc2_jobs ORDER BY created_at DESC LIMIT 25",
  recentMembers:"SELECT id,business,industry,tier,city,status,payment_status,created_at FROM spc2_applications ORDER BY created_at DESC LIMIT 25"
 };
 const sections=await Promise.all(Object.entries(queries).map(async ([key,sql])=>{try{const r=await env.DB.prepare(sql).all();return [key,{available:true,rows:r.results||[]}]}catch{return [key,{available:false,rows:[]}]}}));
 return reply({sections:Object.fromEntries(sections),checkedAt:new Date().toISOString(),limitations:{backupVerified:false,automatedBookingEnabled:false,aiEnabled:false,paymentTotalsComplete:false}});
 }
 if(path==='/api/opportunity/prospects'&&request.method==='GET'){
 const {results}=await env.DB.prepare('SELECT id,business,industry,city,website,source,status,score,demo_at,setup_cents,monthly_cents,created_at,updated_at FROM spc2_opportunity_prospects ORDER BY score DESC, created_at DESC LIMIT 500').all();
 return reply({prospects:results||[]});
 }
 if(request.method!=='POST'&&request.method!=='PATCH')return fail('Not found',404);
 if(Number(request.headers.get('content-length')||0)>8192)return fail('Request too large',413);
 const text=await request.text();if(text.length>8192)return fail('Request too large',413);
 let data;try{data=JSON.parse(text)}catch{return fail('Invalid JSON')}
 if(!data||typeof data!=='object'||Array.isArray(data))return fail('Invalid record');
 const now=new Date().toISOString();
 if(path==='/api/opportunity/prospects'&&request.method==='POST'){
 const business=clean(data.business,120),city=clean(data.city,100),industry=clean(data.industry,20),website=clean(data.website,250),source=clean(data.source,250);
 if(business.length<2||city.length<2||!industries.includes(industry)||!source)return fail('Business, city, industry and public source required');
 if(website){try{if(!['https:','http:'].includes(new URL(website).protocol))return fail('Invalid website')}catch{return fail('Invalid website')}}
 const id=crypto.randomUUID();
 await env.DB.prepare('INSERT INTO spc2_opportunity_prospects(id,business,industry,city,website,source,status,score,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,business,industry,city,website,source,'new',priority(data),now,now).run();
 return reply({id},201);
 }
 const m=path.match(/^\/api\/opportunity\/prospects\/([a-f0-9-]{36})$/);
 if(m&&request.method==='PATCH'){
 const status=clean(data.status,30),demo=clean(data.demoAt,35),setup=data.setupCents??0,monthly=data.monthlyCents??0;
 if(!statuses.includes(status)||![setup,monthly].every(v=>Number.isSafeInteger(v)&&v>=0&&v<=10000000))return fail('Invalid status or fee');
 if(demo&&(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(demo)||!Number.isFinite(Date.parse(demo))))return fail('Invalid appointment time');
 if(status==='demo_booked'&&!demo)return fail('Confirmed demo time is required');
 if(status!=='client'&&(setup||monthly))return fail('Contracted fees require client status');
 const result=await env.DB.prepare('UPDATE spc2_opportunity_prospects SET status=?,demo_at=?,setup_cents=?,monthly_cents=?,updated_at=? WHERE id=?').bind(status,demo||null,setup,monthly,now,m[1]).run();
 return result.meta?.changes===1?reply({ok:true}):fail('Not found',404);
 }
 return fail('Not found',404);
 }catch{return fail('Opportunity storage unavailable; no success recorded',503)}
}
