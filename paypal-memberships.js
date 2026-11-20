'use strict';
const { randomUUID } = require('node:crypto');
const catalog = require('./public/subscription-plans.json');
const { createPayPal, amountCents } = require('./paypal-client');
const { tokenMatches } = require('./pro-access');

const completed = 'PAYMENT.SALE.COMPLETED';
const failed = 'BILLING.SUBSCRIPTION.PAYMENT.FAILED';
const refunds = new Set(['PAYMENT.SALE.REFUNDED', 'PAYMENT.SALE.REVERSED']);
const subscriptionEvents = new Set([
  'BILLING.SUBSCRIPTION.ACTIVATED', 'BILLING.SUBSCRIPTION.UPDATED',
  'BILLING.SUBSCRIPTION.CANCELLED', 'BILLING.SUBSCRIPTION.SUSPENDED',
  'BILLING.SUBSCRIPTION.EXPIRED', failed
]);
const terminal = {CANCELLED: 'cancelled', SUSPENDED: 'suspended', EXPIRED: 'expired'};
const subscriptionId = value => typeof value === 'string' && /^I-[A-Z0-9-]{6,35}$/.test(value);
const transactionId = value => typeof value === 'string' && /^[A-Z0-9-]{6,80}$/.test(value);
const after = (a, b) => (Date.parse(a) || 0) > (Date.parse(b) || 0);

function applicationStatus(application) {
  return {
    id: application.id, industry: application.industry, membership: application.membership,
    status: application.status, paymentStatus: application.paymentStatus || null,
    paidThrough: application.paidThrough || null, workspaceAvailable: Boolean(application.profileId)
  };
}

function activateWorkspace(data, application) {
  if (application.profileId) return;
  application.profileId = application.id;
  data.profiles.push({
    id: application.id, name: application.business, industry: application.industry,
    city: application.city, phone: application.phone, area: application.serviceArea,
    services: application.services, coverageMode: application.coverageMode,
    coverageAreas: application.coverageAreas, coverageZip: application.coverageZip,
    coverageRadius: application.coverageRadius, createdAt: application.createdAt,
    membershipApplicationId: application.id, listed: false, verified: false, featured: false
  });
}

function paidPeriod(subscription, paymentTime, amount) {
  const lastPayment = subscription.billing_info?.last_payment;
  const nextBilling = subscription.billing_info?.next_billing_time;
  // The subscription and transaction representations can report slightly
  // different timestamps for the same PayPal sale.
  const sameCharge = lastPayment?.amount?.currency_code === 'USD' &&
    amountCents(lastPayment.amount.value) === amount &&
    Math.abs(Date.parse(paymentTime) - Date.parse(lastPayment.time)) <= 60_000;
  return subscription.status === 'ACTIVE' && sameCharge && after(nextBilling, paymentTime) ? nextBilling : null;
}

function recordPaidMembership(data, application, saleId, paidAt, paidThrough, recordedAt) {
  application.lastPaymentAt = paidAt;
  application.lastPaymentId = saleId;
  application.status = 'active';
  application.paymentStatus = 'paid';
  application.paidThrough = paidThrough;
  application.membershipActivatedAt ||= recordedAt;
  activateWorkspace(data, application);
}

function saleIdForRefund(resource) {
  if (transactionId(resource.sale_id)) return resource.sale_id;
  const sale = resource.links?.find(link => link.rel === 'sale')?.href;
  if (typeof sale !== 'string') return null;
  return sale.match(/\/v1\/payments\/sale\/([A-Z0-9-]{6,80})$/)?.[1] || null;
}

function createMembershipRoutes({paypal = createPayPal(), now = Date.now} = {}) {
  const integrationAvailable = durable => Boolean(durable && paypal.enabled);

  async function checkout(req, input, plan, {db, save, durable}, reply) {
    if (!integrationAvailable(durable) || !paypal.plans.has(plan.key)) {
      return reply(503, {error: 'Account-linked PayPal checkout is unavailable.', packageKey: plan.key, checkoutEnabled: false});
    }
    const data = db();
    const application = data.intake.find(row => row.id === input.requestId &&
      tokenMatches(req.headers['x-pro-token'], row.accountKeyHash));
    if (!application || application.industry !== plan.industry || application.membership !== plan.package) {
      return reply(404, {error: 'Matching professional application not found.'});
    }
    if (application.status === 'declined' || application.paypalSubscriptionId && !application.paypalCheckout?.approvalUrl) {
      return reply(409, {error: 'Contact the owner about the existing subscription or application.'});
    }

    const configured = paypal.plans.get(plan.key);
    const approvedAmounts = [...new Set(configured.cycles.map(cycle => cycle.price))];
    if (!await paypal.verifyPlan(configured)) return reply(409, {error: 'PayPal terms do not match the approved plan.'});

    if (!application.paypalCheckout) {
      application.paypalCheckout = {
        mode: paypal.mode, id: randomUUID(), planId: configured.id,
        terms: configured.cycles, estimateCredits: configured.estimateCredits, approvedAmounts, createdAt: new Date(now()).toISOString()
      };
      application.status = 'pending_payment_verification';
      save(data);
      // Commit the durable intent before creating an external subscription.
      return reply(202, {pending: true});
    }
    const intent = application.paypalCheckout;
    if (intent.kind === 'hosted' || intent.mode !== paypal.mode || intent.planId !== configured.id ||
        intent.estimateCredits !== configured.estimateCredits || JSON.stringify(intent.terms) !== JSON.stringify(configured.cycles)) {
      return reply(409, {error: 'Contact the owner about the existing checkout.'});
    }
    if (!['interest', 'pending_payment_verification'].includes(application.status) ||
        now() - Date.parse(intent.createdAt) > 12 * 60 * 60 * 1000) {
      return reply(409, {error: 'This checkout has expired or already been used. Contact the owner before paying again.'});
    }
    if (intent.approvalUrl) return reply(200, {approvalUrl: intent.approvalUrl});
    const subscription = await paypal.createSubscription({planId: intent.planId, intentId: intent.id});
    const approvalUrl = paypal.approvalUrl(subscription);
    if (!subscriptionId(subscription.id) || !approvalUrl ||
        data.intake.some(row => row !== application && row.paypalSubscriptionId === subscription.id)) {
      return reply(503, {error: 'PayPal did not confirm a unique checkout.'});
    }
    application.paypalSubscriptionId = subscription.id;
    intent.approvalUrl = approvalUrl;
    save(data);
    return reply(200, {approvalUrl});
  }

  async function hostedPlan(req, {db, save, durable}, reply) {
    if (!integrationAvailable(durable) || !paypal.hostedFallback) {
      return reply(503, {error: 'Hosted checkout is unavailable.'});
    }
    const data = db();
    const application = data.intake.find(row => tokenMatches(req.headers['x-pro-token'], row.accountKeyHash));
    const key = application && application.industry + '-' + application.membership;
    const catalogPlan = catalog.plans.find(row => row.key === key);
    const configured = paypal.plans.get(key);
    if (!catalogPlan || !configured) return reply(404, {error: 'Application not found.'});
    if (application.paypalSubscriptionId || application.status === 'declined' ||
        (application.paypalCheckout && application.paypalCheckout.kind !== 'hosted')) {
      return reply(409, {error: 'A different checkout is already associated with this account.'});
    }
    if (!await paypal.verifyPlan(configured)) return reply(409, {error: 'PayPal terms do not match the approved plan.'});
    if (!application.paypalCheckout) {
      application.paypalCheckout = {
        kind: 'hosted', mode: paypal.mode, planId: configured.id, terms: configured.cycles,
        approvedAmounts: [...new Set(configured.cycles.map(cycle => cycle.price))],
        estimateCredits: configured.estimateCredits, createdAt: new Date(now()).toISOString()
      };
      application.status = 'pending_payment_verification';
      save(data);
    }
    return reply(200, {checkoutUrl: catalogPlan.checkoutUrl});
  }

  async function bindHosted(input, {db, save, durable}, reply) {
    if (!integrationAvailable(durable) || !paypal.hostedFallback) {
      return reply(503, {error: 'Hosted checkout verification is unavailable.'});
    }
    const id = input.subscriptionId;
    if (input.confirmedOwnership !== true || !subscriptionId(id) || !transactionId(input.transactionId) ||
        !Number.isFinite(Date.parse(input.paymentDate))) {
      return reply(400, {error: 'Confirm ownership and enter the merchant subscription, payment ID and payment date.'});
    }
    const data = db();
    const application = data.intake.find(row => row.id === input.applicationId);
    const checkout = application?.paypalCheckout;
    if (application?.status !== 'pending_payment_verification' || checkout?.kind !== 'hosted' ||
        checkout.mode !== paypal.mode || application.paypalSubscriptionId ||
        data.intake.some(row => row.paypalSubscriptionId === id) ||
        (data.paypalTransactions || []).some(row => row.mode === paypal.mode && row.id === input.transactionId)) {
      return reply(409, {error: 'The application or PayPal reference cannot be bound.'});
    }
    const subscription = await paypal.subscription(id);
    const merchantEmail = subscription.subscriber?.email_address;
    if (subscription.id !== id || subscription.plan_id !== checkout.planId || subscription.plan_overridden ||
        merchantEmail?.toLowerCase() !== application.email.toLowerCase()) {
      return reply(409, {error: 'The PayPal plan or payer does not match this application.'});
    }
    const transactions = await paypal.transactions(id, input.paymentDate);
    const sale = transactions.find(row => row.id === input.transactionId && row.status === 'COMPLETED');
    const gross = sale?.amount_with_breakdown?.gross_amount;
    const amount = amountCents(gross?.value);
    const paidThrough = sale && paidPeriod(subscription, sale.time, amount);
    if (!paidThrough || !after(paidThrough, new Date(now()).toISOString()) ||
        gross.currency_code !== 'USD' || !checkout.approvedAmounts.includes(amount)) {
      return reply(409, {error: 'PayPal has not confirmed a matching active, paid period.'});
    }
    data.paypalTransactions ||= [];
    data.paypalTransactions.push({id: sale.id, mode: paypal.mode, subscriptionId: id, applicationId: application.id,
      amount: gross.value, currency: gross.currency_code, at: sale.time, status: 'completed'});
    application.paypalSubscriptionId = id;
    application.hostedPaymentVerifiedAt = new Date(now()).toISOString();
    recordPaidMembership(data, application, sale.id, sale.time, paidThrough, application.hostedPaymentVerifiedAt);
    save(data);
    return reply(200, applicationStatus(application));
  }

  async function webhook(req, {db, save, body, durable}, reply) {
    if (!integrationAvailable(durable)) return reply(503, {error: 'PayPal webhook is unavailable.'});
    const event = await body(req, 128 * 1024);
    if (!event || typeof event.id !== 'string' || !/^WH-[A-Z0-9-]{4,100}$/i.test(event.id) ||
        !Number.isFinite(Date.parse(event.create_time)) || !event.resource) {
      return reply(400, {error: 'Invalid PayPal event.'});
    }
    if (!await paypal.verifyEvent(req.headers, event)) return reply(401, {error: 'Unverified PayPal notification.'});
    const type = event.event_type;
    if (type !== completed && !subscriptionEvents.has(type) && !refunds.has(type)) return reply(200, {ignored: true});

    const data = db();
    data.paypalEvents ||= [];
    data.paypalTransactions ||= [];
    if (data.paypalEvents.some(item => item.mode === paypal.mode && item.id === event.id)) return reply(200, {duplicate: true});

    const resource = event.resource;
    const refund = refunds.has(type);
    const reversedId = type === 'PAYMENT.SALE.REVERSED' && transactionId(resource.id) ? resource.id : null;
    const saleId = refund ? saleIdForRefund(resource) || reversedId : type === completed ? resource.id : null;
    const existingTransaction = saleId && data.paypalTransactions.find(row => row.mode === paypal.mode && row.id === saleId);
    const id = refund ? existingTransaction?.subscriptionId || resource.billing_agreement_id :
      type === completed ? resource.billing_agreement_id : resource.id;
    if (!subscriptionId(id)) return reply(200, {ignored: true});
    const subscription = await paypal.subscription(id);
    const candidates = data.intake.filter(row => {
      const checkout = row.paypalCheckout;
      if (checkout?.mode !== paypal.mode || checkout.planId !== subscription.plan_id) return false;
      if (checkout.kind === 'hosted') return row.paypalSubscriptionId === id && Boolean(row.hostedPaymentVerifiedAt);
      return checkout.id === subscription.custom_id && (!row.paypalSubscriptionId || row.paypalSubscriptionId === id);
    });
    if (candidates.length !== 1 || subscription.id !== id || subscription.plan_overridden === true) {
      return reply(200, {ignored: true});
    }
    const application = candidates[0];
    if (application.status === 'declined' || data.intake.some(row => row !== application && row.paypalSubscriptionId === id)) {
      return reply(200, {ignored: true});
    }
    const receivedAt = new Date(now()).toISOString();
    const paidAt = application.lastPaymentAt;
    const subscriptionState = terminal[subscription.status];
    const allowed = application.paypalCheckout.approvedAmounts;
    if (type === completed && !transactionId(saleId)) return reply(400, {error: 'Invalid PayPal transaction.'});

    if (type === completed && !existingTransaction) {
      const transactions = await paypal.transactions(id, resource.create_time || event.create_time);
      const transaction = transactions.find(row => row.id === saleId && row.status === 'COMPLETED');
      if (!transaction || !Number.isFinite(Date.parse(transaction.time))) {
        return reply(503, {error: 'PayPal has not confirmed this subscription payment yet.'});
      }
      const gross = transaction.amount_with_breakdown?.gross_amount;
      const amount = amountCents(gross?.value);
      const authorizedAmount = gross?.currency_code === 'USD' && allowed.includes(amount);
      const previousCharge = subscription.billing_info?.last_payment?.time;
      const paidThrough = paidPeriod(subscription, transaction.time, amount);
      const newerCharge = Date.parse(previousCharge) - Date.parse(transaction.time) > 60_000;
      if (authorizedAmount && !subscriptionState && !paidThrough && !newerCharge) {
        return reply(503, {error: 'PayPal has not confirmed the current paid billing period.'});
      }
      data.paypalTransactions.push({
        id: saleId, mode: paypal.mode, subscriptionId: id, applicationId: application.id,
        amount: gross?.value || null, currency: gross?.currency_code || null, at: transaction.time,
        status: authorizedAmount ? 'completed' : 'needs_review'
      });
      if (after(transaction.time, paidAt) && !subscriptionState) {
        application.lastPaymentAt = transaction.time;
        application.lastPaymentId = saleId;
        if (paidThrough && !after(application.lastPaymentFailureAt, transaction.time) &&
            !after(application.lastPaymentReversalAt, transaction.time)) {
          recordPaidMembership(data, application, saleId, transaction.time, paidThrough, receivedAt);
        } else if (!authorizedAmount) {
          application.status = 'payment_review';
          application.paymentStatus = 'amount_mismatch';
        }
      }
    } else if (refund && existingTransaction) {
      existingTransaction.status = type === 'PAYMENT.SALE.REFUNDED' ? 'refunded' : 'reversed';
      existingTransaction.reversalAt = event.create_time;
      if (application.lastPaymentId === existingTransaction.id) {
        application.lastPaymentReversalAt = event.create_time;
        application.status = 'payment_review';
        application.paymentStatus = existingTransaction.status;
      }
    } else if (refund) {
      // A refund may be delivered before the completed-payment event.
      return reply(503, {error: 'PayPal sale record is not available yet.'});
    } else if (type === failed && !after(paidAt, event.create_time) &&
        !after(application.lastPaymentFailureAt, event.create_time)) {
      application.lastPaymentFailureAt = event.create_time;
      application.status = 'past_due';
      application.paymentStatus = 'failed';
    }

    if (subscriptionState) application.status = subscriptionState;
    application.paypalSubscriptionId = id;
    application.paymentUpdatedAt = receivedAt;
    data.paypalEvents.push({id: event.id, mode: paypal.mode, type, subscriptionId: id, receivedAt});
    save(data);
    return reply(200, {ok: true});
  }

  async function routes(req, res, context) {
    const {db, send, body, durable, admin} = context;
    const route = new URL(req.url, 'http://localhost').pathname;
    if (!['/api/membership-checkout', '/api/membership/account', '/api/membership/hosted-plan',
      '/api/paypal/webhook', '/api/admin/billing', '/api/admin/billing/preflight', '/api/admin/billing/bind-hosted'].includes(route)) return false;
    const reply = (status, data) => { send(res, status, data); return true; };

    if (route === '/api/membership/account') {
      if (req.method !== 'GET') return reply(405, {error: 'Method not allowed.'});
      const application = db().intake.find(row => tokenMatches(req.headers['x-pro-token'], row.accountKeyHash));
      return application ? reply(200, {
        ...applicationStatus(application),
        checkoutAvailable: integrationAvailable(durable) && application.paypalCheckout?.kind !== 'hosted' &&
          paypal.plans.has(application.industry + '-' + application.membership),
        hostedAvailable: integrationAvailable(durable) && paypal.hostedFallback && !application.paypalSubscriptionId &&
          (!application.paypalCheckout || application.paypalCheckout.kind === 'hosted')
      }) : reply(404, {error: 'Application not found.'});
    }
    if (route === '/api/admin/billing/preflight') {
      if (!admin(req)) return reply(401, {error: 'Owner access required.'});
      if (req.method !== 'GET') return reply(405, {error: 'Method not allowed.'});
      if (!durable || !paypal.configured) return reply(503, {error: 'PayPal checkout verification is not configured.'});
      try {
        const plans = await Promise.all([...paypal.plans].map(async ([key, plan]) => ({
          key, planId: plan.id, match: await paypal.verifyPlan(plan)
        })));
        return reply(plans.every(plan => plan.match) ? 200 : 409, {mode: paypal.mode, plans});
      } catch {
        return reply(503, {error: 'PayPal plan verification is temporarily unavailable.'});
      }
    }
    if (route === '/api/admin/billing') {
      if (!admin(req)) return reply(401, {error: 'Owner access required.'});
      if (req.method !== 'GET') return reply(405, {error: 'Method not allowed.'});
      const data = db();
      return reply(200, {
        subscriptions: data.intake.map(row => ({
          ...applicationStatus(row), business: row.business, paypalSubscriptionId: row.paypalSubscriptionId,
          hostedPending: row.paypalCheckout?.kind === 'hosted' && !row.paypalSubscriptionId
        })),
        transactions: (data.paypalTransactions || []).slice().reverse()
      });
    }
    if (req.method !== 'POST') return reply(405, {error: 'Method not allowed.'});
    try {
      if (route === '/api/paypal/webhook') return await webhook(req, context, reply);
      if (route === '/api/membership/hosted-plan') return await hostedPlan(req, context, reply);
      if (route === '/api/admin/billing/bind-hosted' && !admin(req)) return reply(401, {error: 'Owner access required.'});
      const input = await body(req);
      if (route === '/api/admin/billing/bind-hosted') return await bindHosted(input, context, reply);
      const plan = catalog.plans.find(row => row.key === input.packageKey &&
        row.industry === input.industry && row.package === input.membership);
      if (!plan) return reply(400, {error: 'Select the matching network and package.'});
      return await checkout(req, input, plan, context, reply);
    } catch (error) {
      if (error.status === 400 || error.status === 413) return reply(error.status, {error: error.message});
      return reply(503, {error: 'PayPal verification is temporarily unavailable.'});
    }
  }

  routes.available = integrationAvailable;
  return routes;
}

module.exports = { createMembershipRoutes };
