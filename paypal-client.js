'use strict';
const catalog = require('./public/subscription-plans.json');
const environments = {
  live: {api: 'https://api-m.paypal.com', checkout: 'https://www.paypal.com'},
  sandbox: {api: 'https://api-m.sandbox.paypal.com', checkout: 'https://www.sandbox.paypal.com'}
};

function amountCents(value) {
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(String(value))) return NaN;
  return Math.round(Number(value) * 100);
}

function termsForEnvironment(env, mode) {
  const configuration = JSON.parse(env.PAYPAL_PLAN_TERMS_JSON || '{}');
  const plans = new Map();
  for (const plan of catalog.plans) {
    const terms = configuration[plan.key];
    if (!terms) continue;
    const id = mode === 'live' ? plan.paypalPlanId : terms.id;
    if (!/^P-[A-Z0-9]+$/.test(id) || (mode === 'sandbox' && catalog.plans.some(p => p.paypalPlanId === id))) {
      throw Error('Invalid PayPal plan mapping');
    }
    if (!Array.isArray(terms.cycles) || !terms.cycles.length || terms.cycles.length > 3) {
      throw Error('Approved PayPal billing cycles are required');
    }
    const cycles = terms.cycles.map((cycle, index) => {
      const price = amountCents(cycle.amount);
      const regular = index === terms.cycles.length - 1;
      if (
        !(price > 0) || !Number.isInteger(cycle.count) || cycle.count < 0 ||
        (regular ? cycle.count !== 0 : cycle.count < 1 || cycle.count > 999) ||
        (mode === 'live' && ![amountCents(plan.foundingPrice), amountCents(plan.regularPrice)].includes(price))
      ) throw Error('Unapproved PayPal amount or billing interval');
      return {price, count: cycle.count, tenure: regular ? 'REGULAR' : 'TRIAL'};
    });
    if ([...plans.values()].some(p => p.id === id)) throw Error('Duplicate PayPal plan mapping');
    const estimateCredits = terms.estimateCredits ?? (mode === 'sandbox' ? 0 : undefined);
    if (!Number.isSafeInteger(estimateCredits) || estimateCredits < 0) throw Error('Approved estimate credits are required');
    plans.set(plan.key, {id, cycles, estimateCredits});
  }
  if (mode === 'live' && plans.size !== catalog.plans.length) throw Error('All live PayPal plans require approved terms');
  return plans;
}

function createPayPal({env = process.env, request = fetch, now = Date.now} = {}) {
  const mode = env.PAYPAL_ENVIRONMENT;
  const endpoints = Object.hasOwn(environments, mode) ? environments[mode] : null;
  let plans = new Map(), origin;
  try {
    origin = new URL(env.APP_ORIGIN || '');
    if (origin.protocol !== 'https:' || origin.origin !== env.APP_ORIGIN) throw Error('Invalid APP_ORIGIN');
    if (endpoints) plans = termsForEnvironment(env, mode);
  } catch {
    origin = undefined;
  }
  // Sandbox must never provision paid privileges in the production namespace.
  const production = env.SPC_STORAGE_NAMESPACE === 'production' || env.VERCEL_ENV === 'production';
  const modeAllowed = mode === 'live' ? production : !production;
  const configured = Boolean(
    modeAllowed && endpoints && origin && plans.size &&
    env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET && env.PAYPAL_WEBHOOK_ID
  );
  const enabled = configured && env.PAYPAL_BILLING_ENABLED === 'true';
  let cachedToken, tokenRequest;

  async function fetchAccessToken() {
    const authorization = 'Basic ' + Buffer.from(env.PAYPAL_CLIENT_ID + ':' + env.PAYPAL_CLIENT_SECRET).toString('base64');
    const response = await request(endpoints.api + '/v1/oauth2/token', {
      method: 'POST', headers: {authorization, 'content-type': 'application/x-www-form-urlencoded'},
      body: 'grant_type=client_credentials', redirect: 'error', signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw Error('PayPal authentication unavailable');
    const json = await response.json();
    if (typeof json.access_token !== 'string' || !json.access_token) throw Error('PayPal token missing');
    cachedToken = {value: json.access_token, expiresAt: now() + Math.max(0, Number(json.expires_in) - 60) * 1000};
    return cachedToken.value;
  }

  async function accessToken() {
    if (cachedToken && cachedToken.expiresAt > now()) return cachedToken.value;
    tokenRequest ||= fetchAccessToken().finally(() => { tokenRequest = undefined; });
    return tokenRequest;
  }

  async function call(path, {method = 'GET', headers = {}, data} = {}) {
    if (!configured) throw Error('PayPal integration is not configured');
    const response = await request(endpoints.api + path, {
      method, headers: {authorization: 'Bearer ' + await accessToken(), accept: 'application/json',
        ...(data && {'content-type': 'application/json'}), ...headers},
      body: data && JSON.stringify(data), redirect: 'error', signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw Error('PayPal verification temporarily unavailable');
    return response.json();
  }

  async function verifyPlan(plan) {
    const resource = await call('/v1/billing/plans/' + plan.id);
    const setupFee = resource.payment_preferences?.setup_fee;
    const cycles = resource.billing_cycles;
    if (
      resource.id !== plan.id || resource.status !== 'ACTIVE' || resource.quantity_supported === true ||
      Number(resource.taxes?.percentage || '0') !== 0 ||
      (setupFee && (setupFee.currency_code !== 'USD' || amountCents(setupFee.value) !== 0)) ||
      !Array.isArray(cycles) || cycles.length !== plan.cycles.length
    ) return false;
    return plan.cycles.every((expected, index) => {
      const actual = cycles.find(cycle => cycle.sequence === index + 1);
      const price = actual?.pricing_scheme?.fixed_price;
      return actual?.tenure_type === expected.tenure && actual.total_cycles === expected.count &&
        actual.frequency?.interval_unit === 'MONTH' && actual.frequency.interval_count === 1 &&
        price?.currency_code === 'USD' && amountCents(price.value) === expected.price;
    });
  }

  async function createSubscription({planId, intentId}) {
    const returnUrl = new URL('/pro.html?checkout=returned', origin).href;
    return call('/v1/billing/subscriptions', {
      method: 'POST', headers: {'paypal-request-id': intentId, prefer: 'return=representation'},
      data: {
        plan_id: planId, custom_id: intentId,
        application_context: {user_action: 'SUBSCRIBE_NOW', return_url: returnUrl,
          cancel_url: new URL('/pro.html?checkout=cancelled', origin).href}
      }
    });
  }

  function approvalUrl(subscription) {
    const href = subscription.links?.find(link => link.rel === 'approve' && link.method === 'GET')?.href;
    if (!href) return null;
    const url = new URL(href);
    return url.origin === endpoints.checkout && !url.username && !url.password ? url.href : null;
  }

  async function verifyEvent(headers, event) {
    const body = {
      auth_algo: headers['paypal-auth-algo'], cert_url: headers['paypal-cert-url'],
      transmission_id: headers['paypal-transmission-id'], transmission_sig: headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'], webhook_id: env.PAYPAL_WEBHOOK_ID,
      webhook_event: event
    };
    if (Object.values(body).some(value => !value)) return false;
    let certificate;
    try { certificate = new URL(body.cert_url); } catch { return false; }
    const allowedHosts = mode === 'sandbox' ? ['api.sandbox.paypal.com','api-m.sandbox.paypal.com'] :
      ['api.paypal.com','api-m.paypal.com'];
    if (certificate.protocol !== 'https:' || certificate.port || certificate.username ||
      certificate.password || !allowedHosts.includes(certificate.hostname)) return false;
    const result = await call('/v1/notifications/verify-webhook-signature', {method: 'POST', data: body});
    return result.verification_status === 'SUCCESS';
  }

  async function transactions(id, paymentTime) {
    const time = Date.parse(paymentTime);
    if (!Number.isFinite(time)) throw Error('Invalid PayPal transaction time');
    // PayPal transaction lookup requires a bounded UTC date range.
    const query = new URLSearchParams({
      start_time: new Date(time - 24 * 60 * 60 * 1000).toISOString(),
      end_time: new Date(Math.min(now(), time + 24 * 60 * 60 * 1000)).toISOString()
    });
    return (await call('/v1/billing/subscriptions/' + id + '/transactions?' + query)).transactions || [];
  }

  const estimateReports = enabled && env.PAYPAL_ESTIMATE_REPORTS_ENABLED === 'true';

  async function verifyEstimatePayment(reference, expectedFee, createdAt) {
    if (!estimateReports) throw Error('PayPal estimate reporting is disabled');
    const start = Date.parse(createdAt);
    if (!Number.isFinite(start) || start >= now()) return null;
    const query = new URLSearchParams({
      transaction_id: reference,
      start_date: new Date(start).toISOString(),
      end_date: new Date(now()).toISOString(),
      fields: 'transaction_info'
    });
    const results = await call('/v1/reporting/transactions?' + query);
    const payment = (results.transaction_details || []).map(row => row.transaction_info).find(row =>
      row?.transaction_id === reference && row.transaction_status === 'S' &&
      row.transaction_amount?.currency_code === 'USD' &&
      amountCents(row.transaction_amount.value) === Math.round(expectedFee * 100));
    return payment ? {at: payment.transaction_initiation_date} : null;
  }

  return {
    mode, enabled, configured, plans, verifyPlan, createSubscription, approvalUrl, verifyEvent, transactions, estimateReports, verifyEstimatePayment,
    hostedFallback: mode === 'live' && env.PAYPAL_HOSTED_FALLBACK_ENABLED === 'true',
    subscription: id => call('/v1/billing/subscriptions/' + id)
  };
}

module.exports = { createPayPal, amountCents };
