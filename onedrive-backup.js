'use strict';
const crypto = require('node:crypto');

const GRAPH = 'https://graph.microsoft.com/v1.0';
const LOGIN = 'https://login.microsoftonline.com';
const MAX_BYTES = 4 * 1024 * 1024;
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function config() {
  const { MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, microsoft_client_secret, ONEDRIVE_DRIVE_ID, MICROSOFT_REFRESH_TOKEN } = process.env;
  const secret = MICROSOFT_CLIENT_SECRET || microsoft_client_secret;
  if (!MICROSOFT_TENANT_ID || !MICROSOFT_CLIENT_ID || !secret || (!ONEDRIVE_DRIVE_ID && !MICROSOFT_REFRESH_TOKEN))
    throw new Error('OneDrive backup is not configured: tenant, client, secret, and either a delegated refresh token or drive ID are required');
  return { tenant: MICROSOFT_TENANT_ID, client: MICROSOFT_CLIENT_ID, secret, drive: ONEDRIVE_DRIVE_ID, refresh: MICROSOFT_REFRESH_TOKEN };
}
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('OneDrive request failed (' + response.status + ').');
  return response;
}
async function token(c) {
  const form = new URLSearchParams(c.refresh ? { client_id: c.client, client_secret: c.secret, scope: 'offline_access Files.ReadWrite', grant_type: 'refresh_token', refresh_token: c.refresh } : { client_id: c.client, client_secret: c.secret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' });
  const response = await request(LOGIN + '/' + encodeURIComponent(c.tenant) + '/oauth2/v2.0/token', { method: 'POST', body: form });
  const json = await response.json();
  if (!json.access_token) throw new Error('Microsoft did not return an access token');
  return json.access_token;
}
function itemUrl(c, filename) {
  return (c.refresh ? GRAPH + '/me/drive' : GRAPH + '/drives/' + encodeURIComponent(c.drive)) + '/root:/SuperiorProConnectBackups/' + encodeURIComponent(filename) + ':/content';
}
async function uploadAndVerify(snapshot, { filename = 'verification-' + crypto.randomUUID() + '.json' } = {}) {
  const c = config();
  const key=process.env.BACKUP_ENCRYPTION_KEY;
  if(!/^[a-f0-9]{64}$/i.test(key||''))throw Error('Backup encryption key is not configured.');
  const plaintext=Buffer.from(JSON.stringify(snapshot),'utf8'),iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);
  const encrypted=Buffer.concat([cipher.update(plaintext),cipher.final()]);
  const bytes=Buffer.from(JSON.stringify({version:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:encrypted.toString('base64')}),'utf8');
  if (bytes.length > MAX_BYTES) throw new Error('Snapshot exceeds simple upload limit; implement upload sessions before use');
  const bearer = 'Bearer ' + await token(c);
  const headers = { Authorization: bearer, 'Content-Type': 'application/json' };
  // The destination folder must exist. Never delete or overwrite existing backups.
  const put = await request(itemUrl(c, filename), { method: 'PUT', headers, body: bytes });
  const metadata = await put.json();
  if (!metadata.id) throw new Error('Upload returned no OneDrive item ID');
  const downloaded = Buffer.from(await (await request((c.refresh ? GRAPH + '/me/drive' : GRAPH + '/drives/' + encodeURIComponent(c.drive)) + '/items/' + encodeURIComponent(metadata.id) + '/content', { headers: { Authorization: bearer } })).arrayBuffer());
  const expected = sha256(bytes), actual = sha256(downloaded);
  if (expected !== actual) throw new Error('OneDrive backup checksum mismatch');
  const envelope=JSON.parse(downloaded.toString()),decipher=crypto.createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),Buffer.from(envelope.iv,'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
  const recovered=Buffer.concat([decipher.update(Buffer.from(envelope.data,'base64')),decipher.final()]);
  if(!recovered.equals(plaintext))throw Error('OneDrive recovery verification failed');
  return { verified: true, itemId: metadata.id, filename, bytes: bytes.length, sha256: expected, verifiedAt: new Date().toISOString() };
}
module.exports = { uploadAndVerify, sha256 };
