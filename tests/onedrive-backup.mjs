import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { sha256, uploadAndVerify } = require('../onedrive-backup');
test('SHA-256 deterministic', () => assert.equal(sha256(Buffer.from('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'));
test('backup fails closed when required OneDrive configuration is absent', async () => {
  const keys = ['MICROSOFT_TENANT_ID','MICROSOFT_CLIENT_ID','MICROSOFT_CLIENT_SECRET','microsoft_client_secret','ONEDRIVE_DRIVE_ID','MICROSOFT_REFRESH_TOKEN'];
  const prior = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  try {
    for (const key of keys) delete process.env[key];
    await assert.rejects(uploadAndVerify({ test: true }), /not configured/);
  } finally {
    for (const key of keys) prior[key] === undefined ? delete process.env[key] : process.env[key] = prior[key];
  }
});
test('backup uploads encrypted records and verifies downloaded bytes plus decrypted recovery', async()=>{
 const keys=['MICROSOFT_TENANT_ID','MICROSOFT_CLIENT_ID','MICROSOFT_CLIENT_SECRET','MICROSOFT_REFRESH_TOKEN','BACKUP_ENCRYPTION_KEY'];
 const prior=Object.fromEntries(keys.map(k=>[k,process.env[k]])),originalFetch=global.fetch;
 let uploaded,corrupt=false;
 try{
  Object.assign(process.env,{MICROSOFT_TENANT_ID:'test-tenant',MICROSOFT_CLIENT_ID:'test-client',MICROSOFT_CLIENT_SECRET:'test-secret',MICROSOFT_REFRESH_TOKEN:'test-refresh',BACKUP_ENCRYPTION_KEY:'ab'.repeat(32)});
  global.fetch=async(url,options)=>{
   if(String(url).includes('/oauth2/'))return Response.json({access_token:'test-access'});
   if(options.method==='PUT'){uploaded=Buffer.from(options.body);assert.equal(uploaded.toString().includes('private-customer-test-record'),false);return Response.json({id:'test-file'});}
   return new Response(corrupt?Buffer.concat([uploaded,Buffer.from('corruption')]):uploaded);
  };
  const result=await uploadAndVerify({documents:[{id:'private-customer-test-record'}]});assert.equal(result.verified,true);assert.equal(result.sha256,sha256(uploaded));
  corrupt=true;await assert.rejects(uploadAndVerify({documents:[]}),/checksum/);
 }finally{global.fetch=originalFetch;for(const key of keys)prior[key]===undefined?delete process.env[key]:process.env[key]=prior[key];}
});
