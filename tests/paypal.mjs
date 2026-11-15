import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {createPayPal}=createRequire(import.meta.url)('../paypal');
const env={PAYPAL_CLIENT_ID:'test-client',PAYPAL_CLIENT_SECRET:'test-secret',PAYPAL_WEBHOOK_ID:'test-hook',PAYPAL_ENVIRONMENT:'sandbox',PAYPAL_CHECKOUT_ENABLED:'true',APP_ORIGIN:'https://example.com',PAYPAL_PLANS_JSON:JSON.stringify({'construction:basic':{id:'P-EXAMPLE123',amount:'25.00',currency:'USD'}})};
const record={id:'application-one',industry:'construction',membership:'basic'};
function fixture(){
 const state={calls:[],sub:{id:'I-EXAMPLE123',custom_id:record.id,plan_id:'P-EXAMPLE123',status:'ACTIVE',billing_info:{last_payment:{amount:{value:'25.00',currency_code:'USD'},time:'2026-11-13T00:00:00Z'}}},signature:'SUCCESS',plan:{id:'P-EXAMPLE123',status:'ACTIVE',billing_cycles:[{tenure_type:'REGULAR',frequency:{interval_unit:'MONTH',interval_count:1},pricing_scheme:{fixed_price:{value:'25.00',currency_code:'USD'}}}]}};
 const request=async(url,options)=>{state.calls.push({url,options});if(url.endsWith('/oauth2/token'))return Response.json({access_token:'hidden-token',expires_in:300});assert.equal(options.headers.authorization,'Bearer hidden-token');if(url.includes('/billing/plans/'))return Response.json(state.plan);if(url.endsWith('/verify-webhook-signature'))return Response.json({verification_status:state.signature});if(options.method==='POST')return Response.json({id:'I-EXAMPLE123',links:[{rel:'approve',href:'https://www.sandbox.paypal.com/approval'}]});return Response.json(state.sub)};
 return {state,api:createPayPal({env,request})};
}
test('checkout validates real plan shape and binds subscription to application',async()=>{
 const {state,api}=fixture();const result=await api.create(record);assert.equal(result.subscriptionId,'I-EXAMPLE123');
 const creation=state.calls.find(c=>c.url.endsWith('/billing/subscriptions'));const body=JSON.parse(creation.options.body);
 assert.equal(body.custom_id,record.id);assert.equal(body.plan_id,'P-EXAMPLE123');assert.equal(body.application_context.return_url,'https://example.com/membership.html');
 state.plan.billing_cycles[0].pricing_scheme.fixed_price.value='39.99';await assert.rejects(api.create(record),/price/);
});
test('subscription privileges require exact account binding, plan and confirmed payment',async()=>{
 const {state,api}=fixture();assert.equal((await api.inspect(record,'I-EXAMPLE123')).verified,true);
 delete state.sub.billing_info.last_payment;assert.equal((await api.inspect(record,'I-EXAMPLE123')).verified,false);
 state.sub.custom_id='other-application';await assert.rejects(api.inspect(record,'I-EXAMPLE123'),/does not belong/);
 state.sub.custom_id=record.id;state.sub.billing_info.last_payment={amount:{value:'1.00',currency_code:'USD'}};assert.equal((await api.inspect(record,'I-EXAMPLE123')).verified,false);state.sub.plan_overridden=true;await assert.rejects(api.inspect(record,'I-EXAMPLE123'),/does not belong/);
});
test('signed webhooks are independently verified with PayPal',async()=>{
 const {state,api}=fixture();const headers=Object.fromEntries(['paypal-auth-algo','paypal-cert-url','paypal-transmission-id','paypal-transmission-sig','paypal-transmission-time'].map(k=>[k,'test-'+k]));
 assert.equal((await api.webhook(headers,{id:'WH-123',resource:{id:'I-EXAMPLE123'}})).subscriptionId,'I-EXAMPLE123');
 state.signature='FAILURE';await assert.rejects(api.webhook(headers,{id:'WH-123'}),/signature/);
 await assert.rejects(api.webhook({}, {id:'WH-123'}),/Missing/);
});
test('canceled subscriptions do not retain paid privileges and missing configuration fails closed',async()=>{
 const {state,api}=fixture();state.sub.status='CANCELLED';assert.equal((await api.inspect(record,'I-EXAMPLE123')).verified,false);
 const disabled=createPayPal({env:{},request:()=>{throw Error('must not call remote')}});assert.equal(disabled.config().enabled,false);await assert.rejects(disabled.inspect(record,'I-EXAMPLE123'),/not configured/);
});
