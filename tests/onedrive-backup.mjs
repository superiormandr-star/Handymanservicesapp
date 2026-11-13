import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { sha256, uploadAndVerify } = require('../onedrive-backup');
test('SHA-256 deterministic', () => assert.equal(sha256(Buffer.from('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'));
test('backup fails closed when required OneDrive configuration is absent', async () => {
  const keys = ['MICROSOFT_TENANT_ID','MICROSOFT_CLIENT_ID','MICROSOFT_CLIENT_SECRET','microsoft_client_secret','ONEDRIVE_DRIVE_ID'];
  const prior = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  try {
    for (const key of keys) delete process.env[key];
    await assert.rejects(uploadAndVerify({ test: true }), /not configured/);
  } finally {
    for (const key of keys) prior[key] === undefined ? delete process.env[key] : process.env[key] = prior[key];
  }
});
