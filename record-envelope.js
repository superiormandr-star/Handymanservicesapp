'use strict';
const { createCipheriv, createDecipheriv, randomBytes } = require('node:crypto');
const { validateBackup } = require('./onedrive');

function recordEnvelope(value, key) {
  validateBackup(JSON.stringify(value?.records));
  if (!value.oauth || typeof value.oauth !== 'object' || Array.isArray(value.oauth)) {
    throw Error('Invalid OAuth store');
  }
  return encrypt(Buffer.from(JSON.stringify(value)), key);
}

function openRecordEnvelope(text, key) {
  const value = JSON.parse(decrypt(text, key).toString('utf8'));
  validateBackup(JSON.stringify(value?.records));
  if (!value.oauth || typeof value.oauth !== 'object' || Array.isArray(value.oauth)) {
    throw Error('Invalid OAuth store');
  }
  return value;
}

function encryptionKey(key) {
  if (!/^[a-f0-9]{64}$/i.test(key || '')) throw Error('A 32-byte encryption key is required');
  return Buffer.from(key, 'hex');
}

function encrypt(bytes, key, associatedData) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(key), iv);
  if (associatedData) cipher.setAAD(Buffer.from(associatedData));
  const data = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return JSON.stringify({
    v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64')
  });
}

function decrypt(text, key, associatedData) {
  const value = JSON.parse(text);
  if (value.v !== 1) throw Error('Unknown stored data version');
  const iv = Buffer.from(value.iv, 'base64');
  const tag = Buffer.from(value.tag, 'base64');
  if (iv.length !== 12 || tag.length !== 16) throw Error('Invalid encrypted data');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(key), iv, { authTagLength: 16 });
  if (associatedData) decipher.setAAD(Buffer.from(associatedData));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(value.data, 'base64')), decipher.final()]);
}

module.exports = { recordEnvelope, openRecordEnvelope, encrypt, decrypt };
