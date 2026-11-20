import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import billing from '../paypal-memberships.js';
import catalog from '../public/subscription-plans.json' with {type:'json'};

test('checkout and signed PayPal events bind paid access to the approved application',async()=>{
  const plan=catalog.plans[0],key='a'.repeat(64);
  const record={id:'profile',status:'approved',industry:plan.industry,membership:plan.package};
  const data={intake:[record],proAccess:[{profileId:'profile',tokenHash:createHash('sha256').update(key).digest('hex')}]};
  const live={id:plan.paypalPlanId,status:'ACTIVE',billing_cycles:[{tenure_type:'REGULAR',total_cycles:0,frequency:{interval_unit:'MONTH',interval_count:1},pricing_scheme:{fixed_price:{value:plan.foundingPrice,currency_code:'USD'}}}]};
  let verified=true,subscription,creates=0;
  const request=async(url,options)=>{
    const path=new URL(url).pathname;
    let value;
    if(path==='/v1/oauth2/token')value={access_token:'test',expires_in:3600};
    else if(path.includes('verify-webhook')) value={verification_status:verified?'SUCCESS':'FAILURE'};
    else if(path.includes('/plans/'))value=live;
    else if(path==='/v1/billing/subscriptions'&&options.method==='POST'){
      creates++;const p=JSON.parse(options.body);
      subscription={...p,id:'I-TEST',status:'APPROVAL_PENDING',links:[{rel:'approve',href:'https://www.sandbox.paypal.com/approve'}]};value=subscription;
    }else if(path==='/v1/billing/subscriptions/I-TEST')value=subscription;
    else throw Error('unexpected provider request');
    return Response.json(value);
  };
  const handler=billing.createMembershipRoutes({env:{PAYPAL_CLIENT_ID:'test',PAYPAL_CLIENT_SECRET:'test',PAYPAL_WEBHOOK_ID:'test',PAYPAL_ENVIRONMENT:'sandbox',PAYPAL_CHECKOUT_ENABLED:'true',APP_ORIGIN:'https://example.test'},request});
  async function call(url,payload,headers={}) {
    let result;
    await handler({url,method:'POST',headers},{},{db:()=>data,save:()=>{},body:async()=>payload,send:(_,status,body)=>result={status,body}});
    return result;
  }
  const checkout={industry:plan.industry,membership:plan.package,packageKey:plan.key},url='/api/membership-checkout',pro={'x-pro-token':key};
  assert.equal((await call(url,checkout)).status,403);
  live.billing_cycles[0].frequency.interval_unit='YEAR';
  assert.equal((await call(url,checkout,pro)).status,409);
  live.billing_cycles[0].frequency.interval_unit='MONTH';
  assert.equal((await call(url,checkout,pro)).status,202);
  assert.equal((await call(url,checkout,pro)).body.checkoutUrl,'https://www.sandbox.paypal.com/approve');
  await call(url,checkout,pro);assert.equal(creates,1);assert.equal(record.paidThrough,undefined);
  const signed=Object.fromEntries(['transmission-id','transmission-time','transmission-sig','auth-algo','cert-url'].map(h=>['paypal-'+h,'test']));
  const hook=(kind,id,offset=0)=>({id,event_type:kind,create_time:new Date(Date.now()+offset).toISOString(),resource:{id:'I-TEST',billing_agreement_id:'I-TEST'}});
  const endpoint='/api/paypal/webhook';
  subscription.status='ACTIVE';
  const event=hook('BILLING.SUBSCRIPTION.ACTIVATED','event1');
  verified=false;assert.equal((await call(endpoint,event,signed)).status,403);verified=true;
  await call(endpoint,event,signed);assert.equal(record.paidThrough,null);
  const future=new Date(Date.now()+28*86400000).toISOString();
  subscription.billing_info={last_payment:{time:new Date().toISOString(),amount:{value:plan.foundingPrice,currency_code:'USD'}},next_billing_time:future};
  const paid=hook('PAYMENT.SALE.COMPLETED','event2');
  await call(endpoint,paid,signed);await call(endpoint,paid,signed);
  assert.equal(record.paidThrough,future);assert.equal(record.billingEvents.length,2);
  await call(endpoint,hook('BILLING.SUBSCRIPTION.PAYMENT.FAILED','event3',1000),signed);assert.equal(record.paidThrough,null);
  subscription.billing_info.last_payment.time=new Date(Date.now()+2000).toISOString();
  await call(endpoint,hook('PAYMENT.SALE.COMPLETED','event4',2000),signed);assert.equal(record.paidThrough,future);
  subscription.status='CANCELLED';
  await call(endpoint,hook('BILLING.SUBSCRIPTION.CANCELLED','event5',3000),signed);assert.equal(record.paidThrough,null);
  assert.equal(record.billingStatus,'CANCELLED');
});

test('one-time receipt verification requires the matching merchant, amount, item and payer',async()=>{
 const now=new Date(),row={transaction_info:{transaction_id:'REF123',paypal_account_id:'merchant',transaction_status:'S',transaction_initiation_date:now.toISOString(),transaction_amount:{value:'10.00',currency_code:'USD'}},cart_info:{item_details:[{item_name:'Automotive estimate'}]},payer_info:{email_address:'buyer@example.invalid'}};
 const routes=billing.createMembershipRoutes({env:{PAYPAL_ENVIRONMENT:'sandbox',PAYPAL_CLIENT_ID:'test',PAYPAL_CLIENT_SECRET:'test',PAYPAL_WEBHOOK_ID:'test',PAYPAL_MERCHANT_ID:'merchant'},request:async url=>Response.json(url.endsWith('/token')?{access_token:'test',expires_in:120}:{transaction_details:[row]})});
 const input={industry:'automotive',reference:'REF123',payerEmail:'buyer@example.invalid',createdAt:new Date(+now-1000).toISOString()};
 assert.equal(await routes.verifyEstimate(input),true);
 assert.equal(await routes.verifyEstimate({...input,industry:'construction'}),false);
 assert.equal(await routes.verifyEstimate({...input,payerEmail:'other@example.invalid'}),false);
 row.transaction_info.transaction_status='P';assert.equal(await routes.verifyEstimate(input),false);
});
