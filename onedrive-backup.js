'use strict';
const crypto = require('node:crypto');

const GRAPH = 'https://graph.microsoft.com/v1.0';
const LOGIN = 'https://login.microsoftonline.com';
const MAX_BYTES = 4 * 1024 * 1024;
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function config() {
  const { MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, microsoft_client_secret, ONEDRIVE_DRIVE_ID } = process.env;
  const secret = MICROSOFT_CLIENT_SECRET || microsoft_client_secret;
  if (!MICROSOFT_TENANT_ID || !MICROSOFT_CLIENT_ID || !secret || !ONEDRIVE_DRIVE_ID)
    throw new Error('OneDrive backup is not configured: tenant, client, secret, and ONEDRIVE_DRIVE_ID are required');
  return { tenant: MICROSOFT_TENANT_ID, client: MICROSOFT_CLIENT_ID, secret, drive: ONEDRIVE_DRIVE_ID };
}
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('OneDrive request failed (' + response.status + '): ' + (await response.text()).slice(0,240));
  return response;
}
async function token(c) {
  const form = new URLSearchParams({ client_id: c.client, client_secret: c.secret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' });
  const response = await request(LOGIN + '/' + encodeURIComponent(c.tenant) + '/oauth2/v2.0/token', { method: 'POST', body: form });
  const json = await response.json();
  if (!json.access_token) throw new Error('Microsoft did not return an access token');
  return json.access_token;
}
function itemUrl(c, filename) {
  return GRAPH + '/drives/' + encodeURIComponent(c.drive) + '/root:/SuperiorProConnectBackups/' + encodeURIComponent(filename) + ':/content';
}
async function uploadAndVerify(snapshot, { filename = 'verification-' + crypto.randomUUID() + '.json' } = {}) {
  const bytes = Buffer.from(JSON.stringify(snapshot), 'utf8');
  if (bytes.length > MAX_BYTES) throw new Error('Snapshot exceeds simple upload limit; implement upload sessions before use');
  const c = config();
  const bearer = 'Bearer ' + await token(c);
  const headers = { Authorization: bearer, 'Content-Type': 'application/json' };
  // The destination folder must exist. Never delete or overwrite existing backups.
  const put = await request(itemUrl(c, filename), { method: 'PUT', headers, body: bytes });
  const metadata = await put.json();
  if (!metadata.id) throw new Error('Upload returned no OneDrive item ID');
  const downloaded = Buffer.from(await (await request(GRAPH + '/drives/' + encodeURIComponent(c.drive) + '/items/' + encodeURIComponent(metadata.id) + '/content', { headers: { Authorization: bearer } })).arrayBuffer());
  const expected = sha256(bytes), actual = sha256(downloaded);
  if (expected !== actual) throw new Error('OneDrive backup checksum mismatch');
  return { verified: true, itemId: metadata.id, filename, bytes: bytes.length, sha256: expected, verifiedAt: new Date().toISOString() };
}
module.exports = { uploadAndVerify, sha256 };
