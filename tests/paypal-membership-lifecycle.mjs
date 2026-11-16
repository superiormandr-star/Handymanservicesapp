import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const paypal=require('../paypal-memberships.js');
const catalog=require('../public/subscription-plans.json');
test('exactly six plans recognized and bogus plan IDs rejected',()=>{
 assert.equal(catalog.plans.length,6);
 for(const p of catalog.plans)assert.equal(paypal.planFor(p.paypalPlanId).key,p.key);
 assert.equal(paypal.planFor('P-FAKE'),null);
});
test('subscription is matched only to the exact checkout-bound applicant',()=>{
 const plan=catalog.plans.find(x=>x.key==='automotive-elite');
 const id='12345678-1234-1234-1234-123456789abc';
 const subscription={id:'I-VALID12345',custom_id:id,subscriber:{email_address:'test@example.com'}};
 const r={id,email:'TEST@example.com',industry:'automotive',membership:'elite',status:'pending_payment_verification',paypalSubscriptionId:'I-VALID12345'};
 assert.equal(paypal.matchApplication([r],subscription,plan),r);
 assert.equal(paypal.matchApplication([r,r],subscription,plan),null);
 assert.equal(paypal.matchApplication([{...r,industry:'construction'}],subscription,plan),null);
 assert.equal(paypal.matchApplication([{...r,membership:'essential'}],subscription,plan),null);
 assert.equal(paypal.matchApplication([{...r,paypalSubscriptionId:'I-OTHER'}],subscription,plan),null);
 assert.equal(paypal.matchApplication([r],{...subscription,custom_id:undefined},plan),null);
 assert.equal(paypal.matchApplication([r],{...subscription,custom_id:'different-id'},plan),null);
 assert.equal(paypal.matchApplication([{...r,status:'interest'}],subscription,plan),null);
});
test('webhook activation remains unconfigured without PayPal credentials',()=>{
 if(!process.env.PAYPAL_CLIENT_ID||!process.env.PAYPAL_CLIENT_SECRET||!process.env.PAYPAL_WEBHOOK_ID)assert.equal(paypal.configReady(),false);
});

test('verified credentials alone cannot enable membership before durable account association', async()=>{
 const original={id:process.env.PAYPAL_CLIENT_ID,secret:process.env.PAYPAL_CLIENT_SECRET,webhook:process.env.PAYPAL_WEBHOOK_ID};
 process.env.PAYPAL_CLIENT_ID='test-client';
 process.env.PAYPAL_CLIENT_SECRET='test-secret';
 process.env.PAYPAL_WEBHOOK_ID='test-webhook';
 try{
  let response;
  const done=await paypal.handle({url:'/api/paypal/webhook',method:'POST'}, {}, {
   db(){throw Error('Must not access local storage')},
   save(){throw Error('Must not write local storage')},
   send(_res,status,payload){response={status,payload}}
  });
  assert.equal(done,true);
  assert.equal(response.status,503);
  assert.match(response.payload.error,/transactional storage/);
 }finally{
  for(const [key,value] of Object.entries({PAYPAL_CLIENT_ID:original.id,PAYPAL_CLIENT_SECRET:original.secret,PAYPAL_WEBHOOK_ID:original.webhook})){
   if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
 }
});
