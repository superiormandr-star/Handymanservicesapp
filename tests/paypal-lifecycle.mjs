import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {createPayPal} = require('../paypal-client');
const {createMembershipRoutes} = require('../paypal-memberships');
const {professionalAccess, tokenHash} = require('../pro-access');
const {plans} = require('../public/subscription-plans.json');

const membershipKey = 'construction-essential';
const sandboxId = 'P-SANDBOXESSENTIAL';
const subscriptionId = 'I-SYNTHETIC1';
const privateKey = 'a'.repeat(64);
const appId = 'test-application';
const payerEmail = 'customer@example.invalid';
const checkout = {requestId: appId, industry: 'construction', membership: 'essential', packageKey: membershipKey};
const approvedDate = '2026-11-14T12:00:00.000Z';
const dateIn = (time, delta) => new Date(Date.parse(time) + delta * 864e5).toISOString();
const webhookHeaders = {
 'paypal-auth-algo': 'SHA256withRSA', 'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-example',
 'paypal-transmission-id': 'test-transmission', 'paypal-transmission-sig': 'test-signature',
 'paypal-transmission-time': approvedDate
};

function fixture({live = false, checkoutEnabled = true} = {}) {
 const records = {intake: [{
  id: appId, accountKeyHash: tokenHash(privateKey), industry: checkout.industry, membership: checkout.membership,
  status: 'interest', business: 'Test contractor', email: payerEmail
 }], profiles: []};
 const env = {
  PAYPAL_ENVIRONMENT: live ? 'live' : 'sandbox', PAYPAL_CLIENT_ID: 'test-client', PAYPAL_CLIENT_SECRET: 'test-secret',
  PAYPAL_WEBHOOK_ID: 'test-webhook', PAYPAL_BILLING_ENABLED: String(checkoutEnabled), APP_ORIGIN: 'https://test.example.invalid',
  PAYPAL_HOSTED_FALLBACK_ENABLED: 'true', SPC_STORAGE_NAMESPACE: live?'production':'preview-paypal',
  PAYPAL_PLAN_TERMS_JSON: JSON.stringify(live
   ? Object.fromEntries(plans.map(plan => [plan.key, {cycles: [{amount: plan.foundingPrice, count: 0}], estimateCredits: 0}]))
   : {[membershipKey]: {id: sandboxId, cycles: [{amount: '25.00', count: 0}], estimateCredits: 2}})
 };
 const id = live ? plans.find(plan => plan.key === membershipKey).paypalPlanId : sandboxId;
 const pastCharges = [];
 let planAmount = '25.00', signatureValid = true, creates = 0, time = Date.parse(dateIn(approvedDate, 1));
 const subscription = {
  id: subscriptionId, plan_id: id, status: 'APPROVAL_PENDING', billing_info: {},
  subscriber: {email_address: payerEmail}
 };
 const mock = async (href, options) => {
  const url = new URL(href);
  assert.equal(url.hostname, live ? 'api-m.paypal.com' : 'api-m.sandbox.paypal.com');
  if (url.pathname.endsWith('/oauth2/token')) return Response.json({access_token: 'test-oauth', expires_in: 3600});
  assert.equal(options.headers.authorization, 'Bearer test-oauth');
  if (url.pathname === '/v1/notifications/verify-webhook-signature') {
   const payload = JSON.parse(options.body);
   assert.equal(payload.webhook_id, 'test-webhook');
   assert.match(payload.webhook_event.id, /^WH-/);
   return Response.json({verification_status: signatureValid ? 'SUCCESS' : 'FAILURE'});
  }
  if (url.pathname === '/v1/billing/plans/' + id) return Response.json({
   id, status:'ACTIVE', billing_cycles: [{sequence: 1, tenure_type:'REGULAR', total_cycles: 0,
    frequency: {interval_unit:'MONTH', interval_count:1}, pricing_scheme:{fixed_price:{value:planAmount,currency_code:'USD'}}}],
   payment_preferences:{setup_fee:{value:'0',currency_code:'USD'}}
  });
  if (url.pathname === '/v1/billing/subscriptions') {
   const payload = JSON.parse(options.body);
   assert.equal(payload.plan_id, id);
   assert.equal(options.headers['paypal-request-id'], payload.custom_id);
   assert.equal(payload.application_context.return_url, 'https://test.example.invalid/pro.html?checkout=returned');
   subscription.custom_id = payload.custom_id;
   creates++;
   return Response.json({...subscription, links:[{rel:'approve',method:'GET',
    href:'https://www.sandbox.paypal.com/webapps/billing/subscriptions?ba_token=synthetic'}]});
  }
  if (url.pathname === '/v1/billing/subscriptions/' + subscriptionId) return Response.json(subscription);
  if (url.pathname.endsWith('/transactions')) {
   assert.ok(url.searchParams.get('start_time'));
   assert.ok(url.searchParams.get('end_time'));
   return Response.json({transactions:pastCharges});
  }
  assert.fail('Unexpected PayPal call: '+url.pathname);
 };
 assert.equal(createPayPal({env:{...env,SPC_STORAGE_NAMESPACE:live?'preview-paypal':'production'},request:mock}).enabled,false);
 const provider = createPayPal({env, request:mock, now:() => time});
 assert.equal(provider.enabled, checkoutEnabled);
 const routes = createMembershipRoutes({paypal:provider, now:() => time});
 async function call(url, payload, headers = {}, durable = true) {
  const res = {};
  const handled = await routes({method:payload === undefined ? 'GET' : 'POST', url, headers}, res, {
   db: () => structuredClone(records), save: value => Object.assign(records, value),
   send: (_res, status, data) => Object.assign(res, {status, data}),
   body: async () => payload, durable, admin: request => request.headers['x-admin-token'] === 'test-admin'
  });
  assert.equal(handled, true);
  return res;
 }
 const event = (suffix, type, resource, createTime=approvedDate) =>
  call('/api/paypal/webhook', {id:'WH-TEST-'+suffix, event_type:type, resource, create_time:createTime}, webhookHeaders);
 return {
  records, subscription, call, event, creates: () => creates,
  checkout: key => call('/api/membership-checkout', checkout, {'x-pro-token':key}),
  addPayment(saleId, at, amount = '25.00') {
   time = Date.parse(dateIn(at, 1));
   subscription.status = 'ACTIVE';
   subscription.billing_info = {
    last_payment:{time:at, amount:{value:amount,currency_code:'USD'}}, next_billing_time:dateIn(at,29)
   };
   pastCharges.push({id:saleId, time:at, status:'COMPLETED',
    amount_with_breakdown:{gross_amount:{value:amount,currency_code:'USD'}}});
  },
  invalidateSignature() {signatureValid = false;},
  setPlanAmount(amount) {planAmount = amount;}
 };
}

test('verified PayPal payment activates once, renews, handles failure, refund and cancellation', async () => {
 const f = fixture();
 assert.equal((await f.checkout('b'.repeat(64))).status, 404);
 assert.equal((await f.call('/api/membership-checkout', checkout, {'x-pro-token':privateKey}, false)).status, 503);
 f.setPlanAmount('99.00');
 assert.equal((await f.checkout(privateKey)).status, 409);
 f.setPlanAmount('25.00');
 assert.equal((await f.checkout(privateKey)).status, 202);
 assert.equal(f.creates(), 0);
 assert.equal((await f.checkout(privateKey)).status, 200);
 assert.equal((await f.checkout(privateKey)).status, 200);
 assert.equal(f.creates(), 1);
 let application = f.records.intake[0];
 const intent = application.paypalCheckout.id;
 assert.equal(f.subscription.custom_id, intent);
 assert.equal(application.status, 'pending_payment_verification');

 f.subscription.status = 'ACTIVE';
 assert.equal((await f.event('APPROVAL','BILLING.SUBSCRIPTION.ACTIVATED',{id:subscriptionId})).status,200);
 assert.equal(f.records.intake[0].status,'pending_payment_verification');
 assert.equal(f.records.profiles.length,0);
 assert.equal((await f.call('/api/membership/account',undefined,{'x-pro-token':privateKey})).data.workspaceAvailable,false);

 f.addPayment('SALE-FIRST',approvedDate);
 const payment = {id:'SALE-FIRST',billing_agreement_id:subscriptionId};
 assert.equal((await f.event('SALE1','PAYMENT.SALE.COMPLETED',payment)).status,200);
 application = f.records.intake[0];
 assert.equal(application.status,'active');
 assert.equal(application.paidThrough,dateIn(approvedDate,29));
 assert.equal(f.records.profiles[0].listed,false);
 assert.equal(professionalAccess(f.records,privateKey).membership.paypalCheckout.estimateCredits,2);
 assert.equal((await f.event('SALE1','PAYMENT.SALE.COMPLETED',payment)).data.duplicate,true);
 assert.equal((await f.event('SALE1-AGAIN','PAYMENT.SALE.COMPLETED',payment)).status,200);
 assert.equal(f.records.paypalTransactions.length,1);

 const failureTime = dateIn(approvedDate,29);
 await f.event('FAILED','BILLING.SUBSCRIPTION.PAYMENT.FAILED',{id:subscriptionId},failureTime);
 assert.equal(f.records.intake[0].status,'past_due');
 assert.equal(professionalAccess(f.records,privateKey).active,false);
 const renewedAt = dateIn(approvedDate,31);
 f.addPayment('SALE-RENEWAL',renewedAt);
 const renewed = {id:'SALE-RENEWAL',billing_agreement_id:subscriptionId};
 assert.equal((await f.event('SALE2','PAYMENT.SALE.COMPLETED',renewed,renewedAt)).status,200);
 assert.equal(f.records.intake[0].paidThrough,dateIn(renewedAt,29));
 assert.equal(f.records.intake[0].status,'active');
 await f.event('LATE-FAILURE','BILLING.SUBSCRIPTION.PAYMENT.FAILED',{id:subscriptionId},failureTime);
 assert.equal(f.records.intake[0].status,'active');

 const refundTime = dateIn(renewedAt,2);
 await f.event('REFUND','PAYMENT.SALE.REFUNDED',{id:'REFUND-ID',sale_id:'SALE-RENEWAL'},refundTime);
 assert.equal(f.records.intake[0].status,'payment_review');
 assert.equal(f.records.paypalTransactions[1].status,'refunded');
 f.subscription.status='SUSPENDED';
 await f.event('SUSPEND','BILLING.SUBSCRIPTION.SUSPENDED',{id:subscriptionId},refundTime);
 assert.equal(f.records.intake[0].status,'suspended');
 f.subscription.status='CANCELLED';
 await f.event('CANCEL','BILLING.SUBSCRIPTION.CANCELLED',{id:subscriptionId},refundTime);
 assert.equal(f.records.intake[0].status,'cancelled');
 assert.equal(f.records.profiles.length,1);
});

test('unverified PayPal events and mismatched account bindings never grant access', async () => {
 const f = fixture();
 await f.checkout(privateKey);
 await f.checkout(privateKey);
 f.addPayment('SALE-FOREIGN',approvedDate);
 f.subscription.custom_id='unrelated-checkout';
 const event = {id:'SALE-FOREIGN',billing_agreement_id:subscriptionId};
 assert.equal((await f.event('UNMATCHED','PAYMENT.SALE.COMPLETED',event)).data.ignored,true);
 f.invalidateSignature();
 assert.equal((await f.event('FORGED','PAYMENT.SALE.COMPLETED',event)).status,401);
 assert.equal(f.records.intake[0].status,'pending_payment_verification');
 assert.equal(f.records.profiles.length,0);
 assert.equal(f.records.paypalTransactions,undefined);
});

test('hosted flow preserves the exact live plan URL and needs owner and merchant evidence', async () => {
 const f=fixture({live:true});
 assert.equal((await f.call('/api/membership/hosted-plan',{},{})).status,404);
 const available=await f.call('/api/membership/hosted-plan',{}, {'x-pro-token':privateKey});
 assert.equal(available.data.checkoutUrl,plans.find(plan=>plan.key===membershipKey).checkoutUrl);
 assert.equal(f.records.intake[0].status,'pending_payment_verification');
 assert.equal((await f.checkout(privateKey)).status,409);
 f.addPayment('SALE-MANUAL',approvedDate);
 const input={applicationId:appId,subscriptionId,transactionId:'SALE-MANUAL',paymentDate:approvedDate,confirmedOwnership:true};
 assert.equal((await f.call('/api/admin/billing/bind-hosted',input)).status,401);
 f.subscription.subscriber.email_address='another@example.invalid';
 assert.equal((await f.call('/api/admin/billing/bind-hosted',input,{'x-admin-token':'test-admin'})).status,409);
 f.subscription.subscriber.email_address=payerEmail;
 assert.equal((await f.call('/api/admin/billing/bind-hosted',input,{'x-admin-token':'test-admin'})).status,200);
 assert.equal((await f.call('/api/admin/billing/bind-hosted',input,{'x-admin-token':'test-admin'})).status,409);
 assert.equal(f.records.intake[0].status,'active');
 assert.equal(f.records.paypalTransactions.length,1);
});

test('owner can preflight approved merchant terms with payment collection disabled', async () => {
 const f=fixture({checkoutEnabled:false});
 assert.equal((await f.call('/api/admin/billing/preflight',undefined)).status,401);
 const result=await f.call('/api/admin/billing/preflight',undefined,{'x-admin-token':'test-admin'});
 assert.deepEqual(result.data,{mode:'sandbox',plans:[{key:membershipKey,planId:sandboxId,match:true}]});
 f.setPlanAmount('39.99');
 assert.equal((await f.call('/api/admin/billing/preflight',undefined,{'x-admin-token':'test-admin'})).status,409);
 assert.equal((await f.checkout(privateKey)).status,503);
 assert.equal(f.creates(),0);
});
