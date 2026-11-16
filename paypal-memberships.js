'use strict';
const catalog=require('./public/subscription-plans.json');
const endpoint=process.env.PAYPAL_ENVIRONMENT==='sandbox'?'https://api-m.sandbox.paypal.com':'https://api-m.paypal.com';
const termination=new Set(['BILLING.SUBSCRIPTION.CANCELLED','BILLING.SUBSCRIPTION.SUSPENDED','BILLING.SUBSCRIPTION.EXPIRED']);
const configReady=()=>['PAYPAL_CLIENT_ID','PAYPAL_CLIENT_SECRET','PAYPAL_WEBHOOK_ID'].every(k=>Boolean(process.env[k]));
async function paypalToken(){
 const credentials=Buffer.from(process.env.PAYPAL_CLIENT_ID+':'+process.env.PAYPAL_CLIENT_SECRET).toString('base64');
 const r=await fetch(endpoint+'/v1/oauth2/token',{method:'POST',headers:{authorization:'Basic '+credentials,'content-type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw new Error('PayPal OAuth failed');
 const v=await r.json();if(!v.access_token)throw new Error('Missing PayPal access token');return v.access_token;
}
async function paypalGet(url,token){
 const r=await fetch(endpoint+url,{headers:{authorization:'Bearer '+token,accept:'application/json'},signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw new Error('PayPal subscription lookup failed');return r.json();
}
async function verifiedEvent(req,payload,token){
 const headers=req.headers,body={
 auth_algo:headers['paypal-auth-algo'],
 cert_url:headers['paypal-cert-url'],
 transmission_id:headers['paypal-transmission-id'],
 transmission_sig:headers['paypal-transmission-sig'],
 transmission_time:headers['paypal-transmission-time'],
 webhook_id:process.env.PAYPAL_WEBHOOK_ID,
 webhook_event:payload
 };
 if(Object.values(body).some(x=>!x))return false;
 if(!/^https:\/\/api(?:-m)?\.paypal\.com\//.test(String(body.cert_url))&&!/^https:\/\/api(?:-m)?\.sandbox\.paypal\.com\//.test(String(body.cert_url)))return false;
 const r=await fetch(endpoint+'/v1/notifications/verify-webhook-signature',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
 if(!r.ok)return false;return (await r.json()).verification_status==='SUCCESS';
}
function subscriptionId(event){
 const r=event.resource||{};
 if(event.event_type==='PAYMENT.SALE.COMPLETED')return r.billing_agreement_id||null;
 if(event.event_type?.startsWith('BILLING.SUBSCRIPTION.'))return r.id||null;
 return null;
}
function planFor(id){return catalog.plans.find(p=>p.paypalPlanId===id)||null;}
function matchApplication(records,subscription,plan){
 const email=String(subscription.subscriber?.email_address||'').toLowerCase().trim();
 if(!email)return null;
 const candidates=records.filter(r=>r.email?.toLowerCase().trim()===email && r.industry===plan.industry && r.membership===plan.package && ['interest','pending_payment_verification','verified','active','suspended','cancelled','expired'].includes(r.status) && (!r.paypalSubscriptionId||r.paypalSubscriptionId===subscription.id));
 return candidates.length===1?candidates[0]:null;
}
async function handle(req,res,{db,save,send}){
 if(req.url?.split('?')[0]!=='/api/paypal/webhook')return false;
 if(req.method!=='POST'){send(res,405,{error:'Method not allowed'});return true;}
 if(!configReady()){send(res,503,{error:'PayPal webhook not configured'});return true;}
 // Never grant access through non-durable local-file writes or email-only account matches.
 // A new implementation must use a verified checkout-issued applicant binding and atomic persistence.
 send(res,503,{error:'Automatic membership activation requires transactional storage and verified account association'});return true;
 let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>65536){send(res,413,{error:'Webhook too large'});return true;}}
 let event;try{event=JSON.parse(raw)}catch{send(res,400,{error:'Invalid JSON'});return true;}
 if(!event||!/^WH-[\w-]+$/.test(String(event.id||''))){send(res,400,{error:'Invalid event'});return true;}
 try{
  const token=await paypalToken();
  if(!await verifiedEvent(req,event,token)){send(res,401,{error:'Unverified PayPal notification'});return true;}
  const d=db();d.paypalWebhookEventIds=Array.isArray(d.paypalWebhookEventIds)?d.paypalWebhookEventIds:[];
  if(d.paypalWebhookEventIds.includes(event.id)){send(res,200,{ok:true,duplicate:true});return true;}
  const id=subscriptionId(event);
  const relevant=event.event_type==='PAYMENT.SALE.COMPLETED'||termination.has(event.event_type);
  if(!relevant||!/^I-[\w-]+$/.test(String(id||''))){send(res,200,{ok:true,ignored:true});return true;}
  const subscription=await paypalGet('/v1/billing/subscriptions/'+encodeURIComponent(id),token);
  const plan=planFor(subscription.plan_id);
  if(!plan||subscription.id!==id){send(res,202,{ok:true,unmatched:true});return true;}
  let rec=d.intake.find(r=>r.paypalSubscriptionId===id);
  // Email addresses alone do not establish ownership of a subscription.
  // Only an applicant explicitly bound during an authenticated checkout may be updated.
  if(!rec||rec.industry!==plan.industry||rec.membership!==plan.package){send(res,202,{ok:true,pendingOwnerReview:true});return true;}
  if(rec.paypalSubscriptionId&&rec.paypalSubscriptionId!==id){send(res,409,{error:'Subscription association conflict'});return true;}
  if(event.event_type==='PAYMENT.SALE.COMPLETED'&&subscription.status==='ACTIVE'&&String(event.resource?.state||'completed').toLowerCase()==='completed'){
   rec.status='active';rec.paypalSubscriptionId=id;rec.membershipActivatedAt=new Date().toISOString();
  }else if(termination.has(event.event_type)&&subscription.status!=='ACTIVE'){
   rec.status=event.event_type.split('.').at(-1).toLowerCase();rec.paypalSubscriptionId=id;
  }else{send(res,202,{ok:true,noStateChange:true});return true;}
  // Durable transaction/locking storage required before production multi-instance activation.
  d.paypalWebhookEventIds.push(event.id);d.paypalWebhookEventIds=d.paypalWebhookEventIds.slice(-5000);
  save(d);send(res,200,{ok:true,subscriptionStatus:rec.status});return true;
 }catch(e){send(res,503,{error:'PayPal verification temporarily unavailable'});return true;}
}
module.exports={handle,configReady,planFor,matchApplication};
