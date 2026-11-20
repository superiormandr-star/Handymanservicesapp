'use strict';

const crypto = require('node:crypto');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
function customerAccount(req, data) {
  const key = req.headers['x-customer-account'];
  if (typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key)) return null;
  return (data.customerAccounts || []).find(a => a.keyHash === digest(key));
}
async function customerRoutes(req,res,{db,body,send,save,limited}) {
  const path = req.url.split('?')[0];
  if (path !== '/api/customer/account') return false;
  const data = db();
  const reply = (status,payload) => {send(res,status,payload);return true;};
  if (req.method === 'GET') {
    const account = customerAccount(req,data);
    if (!account) return reply(401,{error:'Enter your private customer access key.'});
    return reply(200,{name:account.name,jobs:(data.jobs||[]).filter(j=>j.customerAccountId === account.id)
      .map(j=>({id:j.id,title:j.title,industry:j.industry,status:j.status,key:j.accountJobKey}))});
  }
  if (req.method !== 'POST') return reply(405,{error:'Method unavailable.'});
  if (limited(req)) return reply(429,{error:'Please try again later.'});
  const input = await body(req);
  const name = String(input.name || '').trim().slice(0,100);
  if (name.length < 2) return reply(400,{error:'Enter a name with at least two characters.'});
  const key = crypto.randomBytes(32).toString('hex');
  (data.customerAccounts ||= []).push({id:crypto.randomUUID(),name,keyHash:digest(key)});
  save(data);return reply(201,{key});
}

function readAttachments(raw = []) {
  if (!Array.isArray(raw) || raw.length > 3) throw Error('Choose up to three attachments.');
  return raw.map(file => {
    if (typeof file?.bytes !== 'string' || file.bytes.length > 350000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(file.bytes)) throw Error('Invalid attachment or file larger than 256 KB.');
    const bytes = Buffer.from(file.bytes,'base64');
    if (bytes.length > 262144 || bytes.toString('base64') !== file.bytes) throw Error('Invalid attachment encoding or size.');
    const type = bytes.subarray(0,3).equals(Buffer.from([255,216,255])) ? 'image/jpeg' :
      bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')) ? 'image/png' :
      bytes.subarray(0,5).toString() === '%PDF-' ? 'application/pdf' : null;
    if (!type) throw Error('Upload JPEG, PNG, or PDF files.');
    return {id:crypto.randomUUID(),name:String(file.name||'Attachment').replace(/[^a-zA-Z0-9 ._-]/g,'_').slice(0,80),type,bytes:file.bytes};
  });
}
module.exports={customerRoutes,customerAccount,readAttachments};
