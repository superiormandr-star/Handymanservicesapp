
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
   const magic=mime==='application/pdf'?binary.startsWith('%PDF-'):mime==='image/png'?binary.startsWith('\x89PNG\r\n\x1a\n'):binary.startsWith('\xff\xd8\xff');
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


const spc2Plans=Object.freeze({
 'construction-essential':{industry:'construction',tier:'essential',planId:'P-8HA54058MH7212436NL5EX3Q',amount:'39.00'},
 'construction-professional':{industry:'construction',tier:'professional',planId:'P-1VM79900PL768641SNL5E7KA',amount:'80.00'},
 'construction-elite':{industry:'construction',tier:'elite',planId:'P-1JG93932CP734950ANL5F2DI',amount:'149.00'},
 'automotive-essential':{industry:'automotive',tier:'essential',planId:'P-2K759018XE8664423NL5GR2I',amount:'25.00'},
 'automotive-professional':{industry:'automotive',tier:'professional',planId:'P-38662930HA324233RNL5GVMI',amount:'60.00'},
 'automotive-elite':{industry:'automotive',tier:'elite',planId:'P-8WL58047SB8224218NL5GUEI',amount:'100.00'}
});
const spc2Clean=(v,n)=>String(v===undefined||v===null?'':v).trim().slice(0,n);
async function spc2ReadJson(request,max=16384){
 if(Number(request.headers.get('content-length')||0)>max)throw Error('Request too large');
 const text=await request.text();
 if(text.length>max)throw Error('Request too large');
 return JSON.parse(text);
}
function spc2PaymentConfig(env){
 return !!(env.PAYPAL_CLIENT_ID&&env.PAYPAL_CLIENT_SECRET&&env.PAYPAL_WEBHOOK_ID&&env.PAYPAL_ENVIRONMENT==='live');
}
async function spc2PayPalProvider(env,endpoint,opt={}){
 const auth=await fetch('https://api-m.paypal.com/v1/oauth2/token',{
  method:'POST',headers:{authorization:'Basic '+btoa(env.PAYPAL_CLIENT_ID+':'+env.PAYPAL_CLIENT_SECRET),
   'content-type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials'});
 if(!auth.ok)throw Error('PayPal authentication failed');
 const token=(await auth.json()).access_token;
 if(!token)throw Error('PayPal token missing');
 const response=await fetch('https://api-m.paypal.com'+endpoint,{
  method:opt.method||'GET',headers:{authorization:'Bearer '+token,'content-type':'application/json',...(opt.headers||{})},
  ...(opt.body?{body:JSON.stringify(opt.body)}:{})});
 if(!response.ok)throw Error('PayPal request failed');
 return response.json();
}
function spc2PlanForSub(sub){
 const result=Object.values(spc2Plans).find(p=>p.planId===sub.plan_id);
 return result||null;
}
function spc2SubscriptionPaid(sub,plan){
 const paid=sub.billing_info?.last_payment, next=sub.billing_info?.next_billing_time;
 const paymentAt=Date.parse(paid?.time||'');
 return sub.status==='ACTIVE'&&sub.plan_id===plan.planId &&
  paid?.amount?.currency_code==='USD'&&Number(paid.amount.value)===Number(plan.amount)&&
  Number.isFinite(paymentAt)&&paymentAt<=Date.now()+300000&&paymentAt>0 &&
  Number.isFinite(Date.parse(next||''))&&Date.parse(next)>Date.now() &&
  !Number(sub.billing_info?.outstanding_balance?.value||0) &&
  !Number(sub.billing_info?.failed_payments_count||0) &&
  sub.plan_overridden!==true;
}

function spc2PlanTermsMatch(live,plan){
 const billing=live?.billing_cycles||[],cycle=billing[0];
 return live?.id===plan.planId&&live.status==='ACTIVE'&&billing.length===1&&
  cycle?.tenure_type==='REGULAR'&&cycle.total_cycles===0&&
  cycle.frequency?.interval_unit==='MONTH'&&cycle.frequency?.interval_count===1&&
  cycle.pricing_scheme?.fixed_price?.currency_code==='USD'&&
  Number(cycle.pricing_scheme.fixed_price.value)===Number(plan.amount)&&
  !Number(live.payment_preferences?.setup_fee?.value||0)&&!Number(live.taxes?.percentage||0);
}
async function spc2CreateSubscriptionCheckout(request,env){
 if(!spc2PaymentConfig(env))return spc2Error('Automatic PayPal checkout connection is not configured yet',503);
 let body;try{body=await spc2ReadJson(request)}catch{return spc2Error('Invalid checkout request')}
 const requestId=spc2Clean(body?.requestId,36),key=spc2Clean(body?.accessKey,64);
 if(!/^[a-f0-9-]{36}$/.test(requestId)||!/^[a-f0-9]{64}$/.test(key))return spc2Error('Valid application access required',401);
 const record=await env.DB.prepare('SELECT id,industry,tier,access_hash,status,paypal_subscription_id FROM spc2_applications WHERE id=?').bind(requestId).first();
 if(!record||await spc2Hash(key)!==record.access_hash)return spc2Error('Application access denied',403);
 if(record.status==='active')return spc2Json({status:'ACTIVE',message:'Membership already active'});
 const plan=spc2Plans[record.industry+'-'+record.tier];
 if(!plan)return spc2Error('Membership package not found',400);
 try{
  const live=await spc2PayPalProvider(env,'/v1/billing/plans/'+encodeURIComponent(plan.planId));
  if(!spc2PlanTermsMatch(live,plan))
   return spc2Error('PayPal plan terms do not match this monthly membership; no payment started',409);
  let subId=record.paypal_subscription_id;
  if(!subId){
   const origin=new URL(request.url).origin;
   const created=await spc2PayPalProvider(env,'/v1/billing/subscriptions',{
    method:'POST',headers:{'PayPal-Request-Id':record.id},
    body:{plan_id:plan.planId,custom_id:record.id,
     application_context:{brand_name:'Superior ProConnect',user_action:'SUBSCRIBE_NOW',
      return_url:origin+'/#advertise',cancel_url:origin+'/#advertise'}}});
   if(!/^I-[A-Z0-9]+$/.test(created?.id||''))throw Error('Subscription response missing ID');
   subId=created.id;
   await env.DB.prepare('UPDATE spc2_applications SET paypal_subscription_id=?,payment_status=?,updated_at=? WHERE id=? AND paypal_subscription_id IS NULL')
    .bind(subId,'awaiting_paypal_approval',new Date().toISOString(),record.id).run();
  }
  const subscription=await spc2PayPalProvider(env,'/v1/billing/subscriptions/'+encodeURIComponent(subId));
  if(subscription.id!==subId||subscription.plan_id!==plan.planId||subscription.custom_id!==record.id)
   return spc2Error('PayPal subscription did not match the selected application',409);
  const approve=subscription.links?.find(x=>x.rel==='approve'),u=approve?.href?new URL(approve.href):null;
  if(!u||u.protocol!=='https:'||u.hostname!=='www.paypal.com')
   return spc2Json({status:subscription.status||'PENDING',message:'PayPal approval link is unavailable. Review your membership status.'});
  return spc2Json({checkoutUrl:u.href,source:'paypal',status:subscription.status});
 }catch{return spc2Error('PayPal cannot authorize this membership right now; no additional payment was submitted',503)}
}

async function spc2MembershipApi(request,env,url){
 const path=url.pathname;
 if(!['/api/join','/api/membership/status','/api/membership-checkout','/api/paypal/webhook'].includes(path))return null;
 if(path==='/api/membership-checkout')return request.method==='POST'?spc2CreateSubscriptionCheckout(request,env):spc2Error('POST required',405);
 if(path==='/api/join'){
  if(request.method!=='POST')return spc2Error('POST required',405);
  let data;try{data=await spc2ReadJson(request)}catch{return spc2Error('Invalid or oversized application');}
  if(!data||typeof data!=='object'||Array.isArray(data))return spc2Error('Invalid application');
  if(data.website)return spc2Json({ok:true},202);
  const business=spc2Clean(data.business,100),email=spc2Clean(data.email,180).toLowerCase(),
   city=spc2Clean(data.city,80),phone=spc2Clean(data.phone,32),
   industry=spc2Clean(data.industry,20),tier=spc2Clean(data.membership,20),
   services=spc2Clean(data.services,300),mode=spc2Clean(data.coverageMode,15),
   areas=spc2Clean(mode==='states'?data.coverageStates:data.coverageAreas,400);
  const plan=spc2Plans[industry+'-'+tier],zip=spc2Clean(data.coverageZip,5),radius=Number(data.coverageRadius);
  const locations=areas.split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean).slice(0,25);
  if(!plan||business.length<3||city.length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||
     services.length<3||!['cities','radius','states'].includes(mode)||
    (mode==='radius'?(!/^\d{5}$/.test(zip)||![5,10,15,25,50,75,100,150].includes(radius)):!locations.length))
    return spc2Error('Complete the business, membership, email, services and service area fields');
  const at=new Date().toISOString(),id=crypto.randomUUID(),access=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
  const hash=await spc2Hash(access);
  try{
   await env.DB.prepare('INSERT INTO spc2_applications(id,business,email,city,phone,industry,tier,services_json,coverage_mode,coverage_json,payment_status,status,access_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
   .bind(id,business,email,city,phone,industry,tier,JSON.stringify(services.split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean)),
    mode,JSON.stringify(mode==='radius'?{zip,radius}:{locations}), 'awaiting_paypal','pending',hash,at,at).run();
  }catch{return spc2Error('Application could not be saved. Please retry.',503)}
  return spc2Json({ok:true,requestId:id,accessKey:access,packageKey:industry+'-'+tier,
   checkoutUrl:'https://www.paypal.com/webapps/billing/plans/subscribe?plan_id='+plan.planId,
   activation:'pending_payment',automaticCheckoutAvailable:spc2PaymentConfig(env),message:'Application saved. Continue to secure recurring PayPal checkout.'},201);
 }
 if(path==='/api/membership/status'){
  if(request.method!=='GET')return spc2Error('GET required',405);
  const id=spc2Clean(url.searchParams.get('id'),36),key=spc2Clean(request.headers.get('x-membership-key'),64);
  if(!/^[0-9a-f-]{36}$/.test(id)||!/^[a-f0-9]{64}$/.test(key))return spc2Error('Member access required',401);
  const applicant=await env.DB.prepare('SELECT industry,tier,status,payment_status,access_hash FROM spc2_applications WHERE id=?').bind(id).first();
  if(!applicant||await spc2Hash(key)!==applicant.access_hash)return spc2Error('Membership not found',404);
  return spc2Json({industry:applicant.industry,tier:applicant.tier,status:applicant.status,paymentStatus:applicant.payment_status,active:applicant.status==='active'&&applicant.payment_status==='confirmed'},200);
 }
 if(request.method!=='POST')return spc2Error('POST required',405);
 if(!spc2PaymentConfig(env))return spc2Error('PayPal payment verification not configured',503);
 const transmission={};
 for(const [k,h] of Object.entries({transmission_id:'paypal-transmission-id',transmission_time:'paypal-transmission-time',
  transmission_sig:'paypal-transmission-sig',auth_algo:'paypal-auth-algo',cert_url:'paypal-cert-url'})){
  transmission[k]=request.headers.get(h);
  if(!transmission[k])return spc2Error('Missing PayPal signature',400);
 }
 if(!/^https:\/\/api(-m)?\.paypal\.com\//.test(transmission.cert_url))return spc2Error('Untrusted PayPal certificate URL',400);
 let event;try{event=await spc2ReadJson(request,262144)}catch{return spc2Error('Invalid PayPal notification',400)}
 if(!event?.id||!event?.event_type||!event?.resource)return spc2Error('Invalid PayPal event',400);
 let signature;
 try{signature=await spc2PayPalProvider(env,'/v1/notifications/verify-webhook-signature',{method:'POST',
  body:{...transmission,webhook_id:env.PAYPAL_WEBHOOK_ID,webhook_event:event}})}
 catch{return spc2Error('PayPal signature confirmation unavailable',503)}
 if(signature.verification_status!=='SUCCESS')return spc2Error('PayPal signature invalid',403);
 const relevant=['BILLING.SUBSCRIPTION.ACTIVATED','BILLING.SUBSCRIPTION.UPDATED','BILLING.SUBSCRIPTION.SUSPENDED',
  'BILLING.SUBSCRIPTION.CANCELLED','BILLING.SUBSCRIPTION.EXPIRED','BILLING.SUBSCRIPTION.PAYMENT.FAILED',
  'PAYMENT.SALE.COMPLETED','PAYMENT.SALE.REFUNDED','PAYMENT.SALE.REVERSED'];
 if(!relevant.includes(event.event_type))return spc2Json({received:true});
 const id=event.event_type.startsWith('PAYMENT.SALE.')?event.resource.billing_agreement_id:event.resource.id;
 if(!/^I-[A-Z0-9]+$/.test(id||''))return spc2Error('Subscription identifier missing',400);
 let subscription;
 try{subscription=await spc2PayPalProvider(env,'/v1/billing/subscriptions/'+encodeURIComponent(id));}
 catch{return spc2Error('PayPal subscription verification unavailable',503)}
 const plan=spc2PlanForSub(subscription),email=spc2Clean(subscription.subscriber?.email_address,180).toLowerCase();
 if(!plan||subscription.id!==id)return spc2Json({received:true,activation:'not_matched'});
 let livePlan;
 try{livePlan=await spc2PayPalProvider(env,'/v1/billing/plans/'+encodeURIComponent(plan.planId));}
 catch{return spc2Error('PayPal plan verification unavailable',503)}
 if(!spc2PlanTermsMatch(livePlan,plan))
  return spc2Error('PayPal billing terms do not match the approved plan',409);
 const bound=(await env.DB.prepare('SELECT id,email,industry,tier,paypal_subscription_id FROM spc2_applications WHERE paypal_subscription_id=?')
  .bind(id).all()).results||[];
 const custom=spc2Clean(subscription.custom_id,36);
 let matches=bound;
 if(!matches.length&&/^[0-9a-f-]{36}$/.test(custom))
  matches=(await env.DB.prepare('SELECT id,email,industry,tier,paypal_subscription_id FROM spc2_applications WHERE id=?').bind(custom).all()).results||[];
 if(!matches.length&&!custom&&email)
  matches=(await env.DB.prepare("SELECT id,email,industry,tier,paypal_subscription_id FROM spc2_applications WHERE email=? AND industry=? AND tier=? AND status='pending' ORDER BY created_at DESC LIMIT 2").bind(email,plan.industry,plan.tier).all()).results||[];
 if(matches.length!==1||matches[0].industry!==plan.industry||matches[0].tier!==plan.tier||
    (custom&&matches[0].id!==custom)||(!custom&&!bound.length&&matches[0].email!==email)||
    (matches[0].paypal_subscription_id&&matches[0].paypal_subscription_id!==id))
   return spc2Json({received:true,activation:'no_unique_matching_application'});
 const application=matches[0],bad=/CANCELLED|SUSPENDED|EXPIRED|PAYMENT\.FAILED|SALE\.(REFUNDED|REVERSED)/.test(event.event_type);
 const active=!bad&&spc2SubscriptionPaid(subscription,plan);
 const at=new Date().toISOString(),paymentStatus=active?'confirmed':bad?'stopped':'awaiting_confirmed_payment',status=active?'active':'pending';
 try{
  await env.DB.batch([
   env.DB.prepare('INSERT OR IGNORE INTO spc2_membership_webhook_events(id,subscription_id,event_type,created_at) VALUES(?,?,?,?)').bind(event.id,id,event.event_type,at),
   env.DB.prepare('UPDATE spc2_applications SET paypal_subscription_id=?,payment_status=?,status=?,updated_at=? WHERE id=?')
    .bind(id,paymentStatus,status,at,application.id)
  ]);
 }catch{return spc2Error('Subscription update could not be saved',503)}
 return spc2Json({received:true,activation:active?'active':'pending'});
}


async function spc2PublicDirectoryApi(request,env,url){
 if(url.pathname!=='/api/profiles')return null;
 if(request.method!=='GET')return spc2Error('GET required',405);
 try{
  const result=await env.DB.prepare("SELECT id,business,city,industry,services_json,coverage_mode,coverage_json,created_at FROM spc2_applications WHERE status='active' AND payment_status='confirmed' ORDER BY created_at DESC LIMIT 100").all();
  const profiles=(result.results||[]).map(row=>{
   const services=JSON.parse(row.services_json||'[]'),coverage=JSON.parse(row.coverage_json||'{}');
   const area=row.coverage_mode==='radius'?(coverage.radius+'-mile radius from ZIP '+coverage.zip):(coverage.locations||[]).join(', ');
   return {id:row.id,name:row.business,city:row.city,industry:row.industry,
     area,services,tagline:'Independent service provider',description:'Contact this professional to discuss service availability.',
     verified:false,featured:false,createdAt:row.created_at};
  });
  const ownerProfile={id:'superior',industry:'construction',ownerListed:true,name:'Superior Maintenance and Remodeling',tagline:'From an idea to a finished improvement.',city:'Fontana',area:'Fontana, California — contact for service coverage',coverageMode:'cities',coverageAreas:[],coverageZip:'',coverageRadius:null,phone:'909-352-3627',website:'https://superior-maintenance-remodeling.indigotune5.chatgpt.site',logo:'/superior-logo.png',description:'Residential and commercial maintenance, painting and remodeling. Contact Superior to discuss the scope, estimate, and availability for your next project.',services:['Painting','Drywall & repairs','Flooring','Kitchens & bathrooms','Doors & windows','Patios & decks','General maintenance','Remodeling'],verified:false,featured:true,createdAt:'2026-11-01T00:00:00.000Z'};
  const automotiveOwnerProfile={"id":"best-wrench-works","logo":"/logos/Best_Wrench_Worx_Original.jpg","industry":"automotive","ownerListed":true,"name":"Best Wrench Worx LLC","city":"Fontana","area":"Fontana, California — contact for service coverage","coverageMode":"cities","coverageAreas":[],"phone":"909-346-9525","tagline":"Automotive repair and maintenance","description":"Contact Best Wrench Worx to discuss automotive repair, maintenance, pricing and availability.","services":["Brakes","Oil service","Transmission service","Alternators & starters","Suspension","Head gaskets","Timing belts & chains","Engine & transmission swaps","Radiators"],"verified":false,"featured":true};
  const ownerProfiles=[ownerProfile,automotiveOwnerProfile];
  return spc2Json({profiles:[...ownerProfiles,...profiles.filter(p=>!ownerProfiles.some(o=>o.id===p.id))]});
 }catch{return spc2Error('Directory temporarily unavailable',503)}
}

// Cloudflare Workers entry point for Superior ProConnect 2.0.
// Fail closed until the existing Node.js routes have been ported and tested.
// Never return fake success for job submissions, payments or membership activation.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/jobs')) { const result = await spc2JobApi(request,env,url); if(result)return result; }
    { const result = await spc2MembershipApi(request,env,url); if(result)return result; }
    { const result = await spc2PublicDirectoryApi(request,env,url); if(result)return result; }
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
