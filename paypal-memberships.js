'use strict';

const crypto = require('node:crypto');
const catalog = require('./public/subscription-plans.json');
const lifecycleEvents = new Set([
  'BILLING.SUBSCRIPTION.ACTIVATED', 'BILLING.SUBSCRIPTION.UPDATED',
  'BILLING.SUBSCRIPTION.SUSPENDED', 'BILLING.SUBSCRIPTION.CANCELLED',
  'BILLING.SUBSCRIPTION.EXPIRED', 'BILLING.SUBSCRIPTION.PAYMENT.FAILED',
  'PAYMENT.SALE.COMPLETED', 'PAYMENT.SALE.REFUNDED', 'PAYMENT.SALE.REVERSED'
]);
const subscriptionId = /^I-[A-Z0-9]+$/;
const binding = key => crypto.createHash('sha256').update(key).digest('hex');

function planMatches(live, plan) {
  const cycles = live.billing_cycles || [];
  const cycle = cycles[0];
  const price = cycle?.pricing_scheme?.fixed_price;
  const setup = live.payment_preferences?.setup_fee;
  return live.id === plan.paypalPlanId && live.status === 'ACTIVE' &&
    cycles.length === 1 && cycle.tenure_type === 'REGULAR' && cycle.total_cycles === 0 &&
    cycle.frequency?.interval_unit === plan.interval && cycle.frequency?.interval_count === plan.intervalCount &&
    price?.currency_code === plan.currency && price.value === plan.foundingPrice &&
    (!setup || Number(setup.value) === 0) && !Number(live.taxes?.percentage) && live.quantity_supported !== true;
}

function createMembershipRoutes({env = process.env, request = fetch} = {}) {
  const host = env.PAYPAL_ENVIRONMENT === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  const approvalHost = host.includes('sandbox') ? 'www.sandbox.paypal.com' : 'www.paypal.com';
  const configured = ['sandbox','live'].includes(env.PAYPAL_ENVIRONMENT) &&
    env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET && env.PAYPAL_WEBHOOK_ID;
  let token, expires = 0;
  async function provider(path, options = {}) {
    if (!token || Date.now() >= expires) {
      const response = await request(host + '/v1/oauth2/token', {
        method:'POST', redirect:'error', signal:AbortSignal.timeout(8000),
        headers:{authorization:'Basic ' + Buffer.from(env.PAYPAL_CLIENT_ID + ':' + env.PAYPAL_CLIENT_SECRET).toString('base64'),
          'content-type':'application/x-www-form-urlencoded'}, body:'grant_type=client_credentials'
      });
      if (!response.ok) throw Error('PayPal authentication unavailable');
      const auth = await response.json();
      if (!auth.access_token) throw Error('Missing access token');
      token = auth.access_token;
      expires = Date.now() + Math.max(0, Number(auth.expires_in) - 60) * 1000;
    }
    const response = await request(host + path, {...options, redirect:'error', signal:AbortSignal.timeout(10000),
      headers:{authorization:'Bearer ' + token, 'content-type':'application/json', ...options.headers}});
    if (!response.ok) throw Error('PayPal verification unavailable');
    return response.json();
  }
  async function membershipRoutes(req, res, {body, db, save, send}) {
    const path = req.url.split('?')[0];
    if (!['/api/membership-checkout','/api/paypal/webhook'].includes(path)) return false;
    const reply = (code, payload) => { send(res, code, payload); return true; };
    if (req.method !== 'POST') return reply(405,{error:'POST required.'});
    const input = await body(req, path.endsWith('/webhook') ? 256 * 1024 : 16384);
    const data = db();
    if (path === '/api/membership-checkout') {
      const plan = catalog.plans.find(p => p.key === input.packageKey && p.industry === input.industry && p.package === input.membership);
      if (!plan) return reply(400,{error:'Select the matching network and package.'});
      if (!configured || env.PAYPAL_CHECKOUT_ENABLED !== 'true') return reply(503,{packageKey:plan.key,checkoutEnabled:false,error:'Membership checkout is awaiting billing verification.'});
      const key = req.headers['x-pro-token'];
      const access = typeof key === 'string' && /^[a-f0-9]{64}$/.test(key) && data.proAccess?.find(a => a.tokenHash === binding(key));
      const record = access && data.intake.find(r => r.id === access.profileId && r.status === 'approved' && r.industry === plan.industry && r.membership === plan.package);
      if (!record) return reply(403,{error:'An approved professional application for this package is required.'});
      try {
        const live = await provider('/v1/billing/plans/' + plan.paypalPlanId);
        if (!planMatches(live, plan)) return reply(409,{error:'PayPal billing terms differ from the listed monthly rate. Checkout is paused.'});
        if (!record.paypalSubscriptionId) {
          // Reserve an application-scoped founding slot before contacting PayPal.
          // A separate committed request makes this safe across concurrent applications.
          if (!record.checkoutReservation) {
            const count = data.intake.filter(r => r.industry === record.industry && r.membership === record.membership &&
              r.checkoutReservation && !['CANCELLED','EXPIRED'].includes(r.billingStatus)).length;
            if (count >= 25) return reply(409,{error:'Founding slots are reserved. Regular-price checkout requires a verified matching plan.'});
            record.checkoutReservation = crypto.randomUUID(); save(data);
            return reply(202,{reserved:true});
          }
          const origin = new URL(env.APP_ORIGIN);
          if (origin.protocol !== 'https:' || origin.origin !== env.APP_ORIGIN) throw Error('Invalid origin');
          const created = await provider('/v1/billing/subscriptions', {method:'POST',
            headers:{'PayPal-Request-Id':record.checkoutReservation},body:JSON.stringify({plan_id:plan.paypalPlanId,custom_id:record.checkoutReservation,
              application_context:{user_action:'SUBSCRIBE_NOW',return_url:origin.origin+'/pro.html',cancel_url:origin.origin+'/pro.html'}})});
          if (!subscriptionId.test(created.id)) throw Error('Invalid subscription response');
          record.paypalSubscriptionId = created.id; record.billingStatus = 'APPROVAL_PENDING'; save(data);
        }
        const sub = await provider('/v1/billing/subscriptions/' + record.paypalSubscriptionId);
        if (sub.custom_id !== record.checkoutReservation || sub.plan_id !== plan.paypalPlanId) throw Error('Binding mismatch');
        const link = sub.links?.find(l => l.rel === 'approve');
        if (!link) return reply(200,{status:sub.status});
        const target = new URL(link.href);
        if (target.origin !== 'https://' + approvalHost) throw Error('Unexpected approval host');
        return reply(200,{checkoutUrl:target.href});
      } catch { return reply(503,{error:'PayPal could not confirm checkout. Please try again.'}); }
    }
    if (!configured) return reply(503,{error:'Payment verification is unavailable.'});
    const signed = {};
    for (const [property,header] of Object.entries({transmission_id:'transmission-id',transmission_time:'transmission-time',transmission_sig:'transmission-sig',auth_algo:'auth-algo',cert_url:'cert-url'})) {
      signed[property] = req.headers['paypal-' + header];
      if (typeof signed[property] !== 'string' || !signed[property]) return reply(400,{error:'Missing PayPal signature.'});
    }
    try {
      const proof = await provider('/v1/notifications/verify-webhook-signature',{method:'POST',body:JSON.stringify({...signed,webhook_id:env.PAYPAL_WEBHOOK_ID,webhook_event:input})});
      if (proof.verification_status !== 'SUCCESS') return reply(403,{error:'Invalid PayPal signature.'});
      if (!lifecycleEvents.has(input.event_type)) return reply(200,{received:true});
      const sale = input.event_type.startsWith('PAYMENT.SALE.');
      const id = sale ? input.resource?.billing_agreement_id : input.resource?.id;
      if (!subscriptionId.test(id || '') || !input.id || !Number.isFinite(Date.parse(input.create_time))) return reply(400,{error:'Incomplete subscription event.'});
      const record = data.intake.find(r => r.paypalSubscriptionId === id);
      if (!record) return reply(200,{received:true});
      if (record.billingEvents?.some(e => e.id === input.id)) return reply(200,{received:true});
      const sub = await provider('/v1/billing/subscriptions/' + id);
      const plan = catalog.plans.find(p => p.industry === record.industry && p.package === record.membership);
      if (!plan || sub.id !== id || sub.plan_id !== plan.paypalPlanId || sub.custom_id !== record.checkoutReservation) return reply(409,{error:'Subscription does not match this application.'});
      const last = sub.billing_info?.last_payment;
      const next = sub.billing_info?.next_billing_time;
      const adverse = /PAYMENT\.FAILED|SALE\.(REFUNDED|REVERSED)/.test(input.event_type);
      if (adverse) record.billingHoldAt = Math.max(record.billingHoldAt || 0, Date.parse(input.create_time));
      const paid = last?.amount?.currency_code === plan.currency && last.amount.value === plan.foundingPrice &&
        Date.parse(last.time) > (record.billingHoldAt || 0) && Date.parse(next) > Date.now() &&
        !Number(sub.billing_info?.outstanding_balance?.value) && !Number(sub.billing_info?.failed_payments_count);
      const eligible = sub.status === 'ACTIVE' && paid && sub.plan_overridden !== true &&
        planMatches(await provider('/v1/billing/plans/' + sub.plan_id), plan);
      record.billingStatus = sub.status === 'ACTIVE' && !eligible ? 'PAYMENT_UNVERIFIED' : sub.status;
      record.paidThrough = eligible ? next : null;
      record.billingEvents = [...(record.billingEvents || []),{id:input.id,type:input.event_type,at:input.create_time}].slice(-100);
      save(data); return reply(200,{received:true});
    } catch { return reply(503,{error:'PayPal verification unavailable. Retry delivery.'}); }
  }
  membershipRoutes.verifyEstimate = async ({reference,industry,payerEmail,createdAt}) => {
    if (!configured || !env.PAYPAL_MERCHANT_ID || !payerEmail) return false;
    const expected=catalog.estimatePayments.find(p=>p.industry===industry);
    if(!expected)return false;
    const start=new Date(createdAt),end=new Date();
    const params=new URLSearchParams({transaction_id:reference,start_date:start.toISOString(),end_date:end.toISOString(),fields:'all',balance_affecting_records_only:'Y'});
    const result=await provider('/v1/reporting/transactions?'+params);
    return (result.transaction_details||[]).some(detail=>{
      const tx=detail.transaction_info,items=detail.cart_info?.item_details||[];
      return tx?.transaction_id===reference && tx.paypal_account_id===env.PAYPAL_MERCHANT_ID &&
        tx.transaction_status==='S' && Date.parse(tx.transaction_initiation_date)>=start.getTime() &&
        tx.transaction_amount?.currency_code===expected.currency && tx.transaction_amount?.value===expected.amount &&
        detail.payer_info?.email_address?.toLowerCase()===payerEmail.toLowerCase() &&
        items.length===1 && items[0].item_name?.toLowerCase()===expected.displayedItem.toLowerCase();
    });
  };
  return membershipRoutes;
}
module.exports = {createMembershipRoutes, planMatches};
