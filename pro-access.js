'use strict';
const { createHash, timingSafeEqual } = require('node:crypto');

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

function tokenMatches(token, hash) {
  return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token) &&
    typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash) &&
    timingSafeEqual(Buffer.from(tokenHash(token), 'hex'), Buffer.from(hash, 'hex'));
}

function professionalAccess(data, token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  const stored = (data.proAccess || []).find(entry => tokenMatches(token, entry.tokenHash));
  const application = (data.intake || []).find(entry =>
    entry.status !== 'declined' && tokenMatches(token, entry.accountKeyHash));
  const profile = data.profiles.find(entry => entry.id === (stored?.profileId || application?.profileId));
  if (!profile) return null;
  const membership = application || (data.intake || []).find(entry => entry.id === profile.membershipApplicationId);
  return {profile, membership, active: !membership || (membership.status === 'active' &&
    Number.isFinite(Date.parse(membership.paidThrough)) && Date.parse(membership.paidThrough) > Date.now())};
}

module.exports = { tokenHash, tokenMatches, professionalAccess };
