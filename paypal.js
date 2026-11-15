'use strict';
const crypto=require('node:crypto');
function createPayPal({env=process.env,request=fetch}={}){
 const base=env.PAYPAL_ENVIRONMENT==='sandbox'?'https://api-m.sandbox.paypal.com':'https://api-m.paypal.com';
 let cached;
 const configured=Boolean(env.PAYPAL_CLIENT_ID&&env.PAYPAL_CLIENT_SECRET&&env.PAYPAL_WEBHOOK_ID);
 function plans(){
  const value=JSON.parse(env.PAYPAL_PLANS_JSON||'{}');
  for(const [key,p] of Object.entries(value))if(!/^(construction|automotive):(basic|pro)$/.test(key)||!/^P-[A-Z0-9]+$/.test(p.id||'')||!/^\d+\.\d{2}$/.test(p.amount||'')||p.currency!=='USD')throw Error('PayPal plan configuration is invalid.');
  return value;
 }
 function requireConfig(){if(!configured)throw Error('PayPal server verification is not configured. Checkout remains disabled.');}
 async function access(){
  requireConfig();if(cached&&cached.expiresAt>Date.now()+60000)return cached.value;
  const r=await request(base+'/v1/oauth2/token',{method:'POST',headers:{authorization:'Basic '+Buffer.from(env.PAYPAL_CLIENT_ID+':'+env.PAYPAL_CLIENT_SECRET).toString('base64'),'content-type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error('PayPal authentication failed.');const v=await r.json();
  if(!v.access_token)throw Error('PayPal did not return an access token.');
  cached={value:v.access_token,expiresAt:Date.now()+Number(v.expires_in||300)*1000};return cached.value;
 }
 async function api(path,options={}){
  const r=await request(base+path,{...options,headers:{authorization:'Bearer '+await access(),'content-type':'application/json',...options.headers},signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error('PayPal verification request failed ('+r.status+').');
  return r.status===204?{}:r.json();
 }
 const planFor=record=>plans()[record.industry+':'+record.membership];
 async function validatedPlan(record){
  requireConfig();const expected=planFor(record);if(!expected)throw Error('No approved PayPal plan is configured for this membership.');
  const p=await api('/v1/billing/plans/'+encodeURIComponent(expected.id));
  const cycles=p.billing_cycles||[],regular=cycles.find(c=>c.tenure_type==='REGULAR');
  if(p.status!=='ACTIVE'||cycles.length!==1||!regular||regular.frequency?.interval_unit!=='MONTH'||regular.frequency.interval_count!==1||regular.pricing_scheme?.fixed_price?.value!==expected.amount||regular.pricing_scheme?.fixed_price?.currency_code!==expected.currency||Number(p.payment_preferences?.setup_fee?.value||0)!==0)throw Error('PayPal plan price, interval, or fees do not match the approved configuration.');
  return expected;
 }
 return {
  configured,
  config(){return {enabled:configured&&env.PAYPAL_CHECKOUT_ENABLED==='true',environment:env.PAYPAL_ENVIRONMENT==='sandbox'?'sandbox':'live'};},
  async create(record){
   if(env.PAYPAL_CHECKOUT_ENABLED!=='true')throw Error('Membership checkout is not enabled.');
   const plan=await validatedPlan(record),origin=new URL(env.APP_ORIGIN||'').origin;
   if(!origin.startsWith('https://'))throw Error('PayPal return origin must use HTTPS.');
   const result=await api('/v1/billing/subscriptions',{method:'POST',headers:{'PayPal-Request-Id':'spc-'+record.id},body:JSON.stringify({plan_id:plan.id,custom_id:record.id,application_context:{brand_name:'Superior ProConnect',user_action:'SUBSCRIBE_NOW',return_url:origin+'/membership.html',cancel_url:origin+'/membership.html?canceled=1'}})});
   const href=result.links?.find(l=>l.rel==='approve')?.href;
   const url=new URL(href||'https://invalid.invalid');
   if(!result.id||url.protocol!=='https:'||!['www.paypal.com','www.sandbox.paypal.com','paypal.com','sandbox.paypal.com'].includes(url.hostname))throw Error('PayPal did not return a valid approval link.');
   return {subscriptionId:result.id,approvalUrl:href};
  },
  async inspect(record,id){
   if(!/^I-[A-Z0-9-]{6,}$/i.test(id||''))throw Error('Invalid subscription reference.');
   const expected=await validatedPlan(record),sub=await api('/v1/billing/subscriptions/'+encodeURIComponent(id));
   if(sub.custom_id!==record.id||sub.plan_id!==expected.id||sub.plan_overridden===true||Number(sub.quantity||1)!==1)throw Error('Subscription does not belong to this application and approved plan.');
   const amount=sub.billing_info?.last_payment?.amount;
   const verified=sub.status==='ACTIVE'&&amount?.currency_code===expected.currency&&amount?.value===expected.amount;
   return {verified,status:sub.status,lastPaymentAt:verified?sub.billing_info.last_payment.time:null,checkedAt:new Date().toISOString()};
  },
  async webhook(headers,event){
   requireConfig();if(!event||typeof event.id!=='string'||!event.id||event.id.length>120)throw Error('Invalid PayPal event.');
   const required=['paypal-auth-algo','paypal-cert-url','paypal-transmission-id','paypal-transmission-sig','paypal-transmission-time'];
   if(required.some(k=>!headers[k]||typeof headers[k]!=='string'))throw Error('Missing PayPal signature headers.');
   const result=await api('/v1/notifications/verify-webhook-signature',{method:'POST',body:JSON.stringify({auth_algo:headers['paypal-auth-algo'],cert_url:headers['paypal-cert-url'],transmission_id:headers['paypal-transmission-id'],transmission_sig:headers['paypal-transmission-sig'],transmission_time:headers['paypal-transmission-time'],webhook_id:env.PAYPAL_WEBHOOK_ID,webhook_event:event})});
   if(result.verification_status!=='SUCCESS')throw Error('PayPal signature verification failed.');
   return {eventId:event.id,subscriptionId:event.resource?.billing_agreement_id||(event.resource?.id?.startsWith('I-')?event.resource.id:null)};
  }
 };
}
const checkoutHash=value=>crypto.createHash('sha256').update(value).digest('hex');
module.exports={createPayPal,checkoutHash};
