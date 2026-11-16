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
test('matching account must be unique and in correct industry and tier',()=>{
 const plan=catalog.plans.find(x=>x.key==='automotive-elite');
 const subscription={id:'I-VALID12345',subscriber:{email_address:'test@example.com'}};
 const r={email:'TEST@example.com',industry:'automotive',membership:'elite',status:'interest',paypalSubscriptionId:null};
 assert.equal(paypal.matchApplication([r],subscription,plan),r);
 assert.equal(paypal.matchApplication([r,r],subscription,plan),null);
 assert.equal(paypal.matchApplication([{...r,industry:'construction'}],subscription,plan),null);
 assert.equal(paypal.matchApplication([{...r,membership:'essential'}],subscription,plan),null);
 assert.equal(paypal.matchApplication([{...r,paypalSubscriptionId:'I-OTHER'}],subscription,plan),null);
 assert.equal(paypal.matchApplication([r],{...subscription,subscriber:{email_address:''}},plan),null);
});
test('webhook activation remains unconfigured without PayPal credentials',()=>{
 if(!process.env.PAYPAL_CLIENT_ID||!process.env.PAYPAL_CLIENT_SECRET||!process.env.PAYPAL_WEBHOOK_ID)assert.equal(paypal.configReady(),false);
});
