(() => {
  'use strict';
  const form = document.querySelector('#hosted-payment-form');
  const view = document.querySelector('#billing-records');
  const status = document.querySelector('#billing-status');
  let token = '';

  async function request(path, payload) {
    const response = await fetch('/api/admin/billing' + path, {
      method: payload ? 'POST' : 'GET',
      headers: {'x-admin-token': token, 'content-type': 'application/json'},
      body: payload && JSON.stringify(payload), cache: 'no-store'
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || 'Billing request failed.');
    return result;
  }

  function renderList(title, rows) {
    const heading = document.createElement('h3');
    heading.textContent = title;
    const list = document.createElement('ul');
    for (const row of rows) {
      const item = document.createElement('li');
      item.textContent = row;
      list.append(item);
    }
    if (!rows.length) list.textContent = 'None recorded.';
    return [heading, list];
  }

  async function refresh() {
    const activeToken = token;
    const {subscriptions, transactions} = await request('');
    if (activeToken !== token) return;
    view.replaceChildren(
      ...renderList('Applications and subscriptions', subscriptions.map(record => [
        record.business, record.industry, record.membership, record.status,
        record.paymentStatus, record.paypalSubscriptionId
      ].filter(Boolean).join(' · '))),
      ...renderList('PayPal transaction records', transactions.map(record => [
        record.id, record.amount, record.currency, record.status, record.mode, record.at
      ].filter(Boolean).join(' · ')))
    );
    const pending = subscriptions.filter(record => record.hostedPending);
    form.hidden = !pending.length;
    form.elements.applicationId.replaceChildren(...pending.map(record => {
      const option = document.createElement('option');
      option.value = record.id;
      option.textContent = record.business;
      return option;
    }));
  }

  document.addEventListener('owner-workspace', async event => {
    token = event.detail.token;
    status.textContent = '';
    try { await refresh(); }
    catch (error) { status.textContent = error.message; }
  });
  document.addEventListener('owner-signout', () => {
    token = '';
    form.reset();
    form.hidden = true;
    view.replaceChildren();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    try {
      const payload = Object.fromEntries(new FormData(form));
      await request('/bind-hosted', {...payload, confirmedOwnership: form.elements.confirmedOwnership.checked});
      await refresh();
      status.textContent = 'PayPal subscription verified.';
    } catch (error) {
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
})();
