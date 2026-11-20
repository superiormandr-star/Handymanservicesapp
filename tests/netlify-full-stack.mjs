import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createEmulator,ownerToken,namespace} from './support/netlify-emulator.mjs';

const owner={'x-admin-token':ownerToken};
const fixtureJob={industry:'construction', title:'Repair a test wall',description:'Patch and finish the damaged drywall in the test room.',
 category:'Drywall',city:'Fontana, CA',measurements:'12 ft by 8 ft',name:'Test Customer',email:'buyer@example.invalid',
 phone:'909-555-0142',address:'132 Test Street',bidLimit:3,consent:true,rulesAccepted:true};
const fixturePro={industry:'construction',membership:'professional',business:'Test Pro Account',city:'Fontana',
 email:'contractor@example.invalid',services:'Drywall',coverageMode:'cities',coverageAreas:'Fontana'};

function client(base) {
 return async (path,{data,headers={},raw}={}) => {
  const hasBody=raw!==undefined||data!==undefined;
  const response=await fetch(base+path,{method:hasBody?'POST':'GET',
   headers:{...(data!==undefined&&{'content-type':'application/json'}),...headers},
   body:raw||JSON.stringify(data)});
  const json=response.headers.get('content-type')?.includes('application/json');
  const body=json?await response.json():Buffer.from(await response.arrayBuffer());
  return {status:response.status,headers:response.headers,body};
 };
}

test('Netlify Functions and the local Blobs SDK persist private jobs, photos, billing records and restored state',async()=>{
 const environment=await createEmulator();
 try{
  assert.deepEqual(await environment.records().init(),{profiles:0,reviews:0,intake:0,documents:0,bids:0,photos:0});
  await assert.rejects(environment.records().init(),/already has records/);
  let base=await environment.start(),request=client(base);
  const health=await request('/api/health');
  assert.equal(health.status,200);assert.equal(health.body.writesEnabled,true);
  assert.match(health.body.persistence,/encrypted durable netlify/);
  for(const path of ['/terms.html','/privacy.html','/standards.html','/service-worker.js','/manifest.webmanifest']){
   assert.equal((await request(path)).status,200,path);
  }
  for(const path of ['/api/admin/inventory','/api/admin/export','/api/admin/billing','/api/command/estimates']){
   assert.equal((await request(path)).status,401,path);
  }
  const signup=await request('/api/join',{data:fixturePro});
  assert.equal(signup.status,201);assert.match(signup.body.accountKey,/^[a-f0-9]{64}$/);
  const signupKey={'x-pro-token':signup.body.accountKey};
  assert.equal((await request('/api/membership/account',{headers:signupKey})).body.status,'interest');
  assert.equal((await request('/api/crm/workspace',{headers:signupKey})).status,401);
  assert.equal((await request('/api/paypal/webhook',{data:{}})).status,503);

  const providers=[];
  for(const name of ['Test Drywall One','Test Drywall Two']){
   const profile=await request('/api/admin/profile',{headers:owner,data:{name,city:'Fontana',services:['Drywall']}});
   assert.equal(profile.status,200);
   const key=await request('/api/admin/pro-access',{headers:owner,data:{profileId:profile.body.profile.id}});
   assert.equal(key.status,201);
   providers.push({'x-pro-token':key.body.token});
   const entitlement=await request('/api/admin/jobs/entitlements',{headers:owner,
    data:{profileId:profile.body.profile.id,tier:'pro',confirmedInPayPal:true}});
   assert.equal(entitlement.status,200);
  }
  assert.equal((await request('/api/crm/workspace',{headers:providers[0]})).status,200);

  const posted=await request('/api/jobs',{data:fixtureJob});
  assert.equal(posted.status,201);
  const path='/api/jobs/'+posted.body.jobId,customer={'x-customer-key':posted.body.customerKey};
  assert.equal((await request(path)).status,404);
  assert.equal((await request(path,{headers:customer})).body.measurements,fixtureJob.measurements);

  const jpeg=await readFile(new URL('./support/test-photo.jpg',import.meta.url));
  const headers={...customer,'content-type':'image/jpeg'};
  assert.equal((await request(path+'/photos',{headers,raw:Buffer.from('not an image')})).status,400);
  const uploaded=await request(path+'/photos',{headers,raw:jpeg});
  assert.equal(uploaded.status,201);
  const attachment=uploaded.body.photo.id;
  const privatePhoto=path+'/photos/'+attachment;
  assert.equal((await request(privatePhoto)).status,404);
  const verifiedPhoto=await request(privatePhoto,{headers:customer});
  assert.equal(verifiedPhoto.status,200);
  assert.match(verifiedPhoto.headers.get('cache-control'),/no-store/);
  assert.equal(verifiedPhoto.headers.get('content-type'),'image/jpeg');
  assert.ok(!verifiedPhoto.body.includes('synthetic-gps-metadata'));
  assert.equal((await request(path+'/photos',{headers,raw:jpeg})).status,200);

  const proPath='/api/pro/jobs/'+posted.body.jobId;
  const photoForPro=proPath+'/photos/'+attachment;
  assert.equal((await request(photoForPro,{headers:providers[0]})).status,404);
  const placed=await request(proPath+'/bids',{headers:providers[0],
   data:{amount:800,scope:'Replace and finish the damaged section.',feeAcknowledged:true,rulesAccepted:true}});
  assert.equal(placed.status,201);
  const decline=await request(proPath+'/bids',{headers:providers[1],
   data:{amount:900,scope:'Prepare, repair and paint the test wall.',feeAcknowledged:true,rulesAccepted:true}});
  assert.equal(decline.status,201);
  assert.equal((await request(path+'/decline',{headers:customer,data:{bidId:decline.body.bidId}})).status,200);
  assert.equal((await request(path+'/select',{headers:customer,data:{bidId:decline.body.bidId}})).status,400);
  assert.equal((await request(path+'/clarify',{headers:customer,data:{bidId:placed.body.bidId,question:'Does the estimate include primer?'}})).status,200);
  assert.equal((await request(proPath+'/answer',{headers:providers[0],data:{bidId:placed.body.bidId,answer:'Yes, primer and finish paint are included.'}})).status,200);
  assert.equal((await request(path+'/select',{headers:customer,data:{bidId:placed.body.bidId}})).status,200);
  const selected=await request('/api/pro/jobs',{headers:providers[0]});
  assert.equal(selected.body.jobs[0].customerContact.address,fixtureJob.address);
  const unselected=await request('/api/pro/jobs',{headers:providers[1]});
  assert.equal(unselected.body.jobs[0].customerContact,null);
  assert.equal((await request(photoForPro,{headers:providers[0]})).status,404);
  assert.equal((await request(path+'/share-photos',{headers:customer,data:{sharePhotos:true}})).status,200);
  assert.equal((await request(photoForPro,{headers:providers[0]})).status,200);
  assert.equal((await request(photoForPro,{headers:providers[1]})).status,404);
  assert.equal((await request(proPath+'/progress',{headers:providers[0],data:{progress:'scheduled'}})).status,200);
  const invoice=await request(proPath+'/invoice',{headers:providers[0],data:{confirm:true}});
  assert.equal(invoice.status,200);
  const again=await request(proPath+'/invoice',{headers:providers[0],data:{confirm:true}});
  assert.equal(again.body.invoice.number,invoice.body.invoice.number);
  assert.equal((await request(path,{headers:customer})).body.invoice.total,800);

  const stored=await environment.store.get(namespace+'/state.json.enc');
  assert.ok(!stored.includes(fixtureJob.email));
  assert.ok(!stored.includes(signup.body.accountKey));
  await environment.stop();
  base=await environment.start();
  request=client(base);
  assert.equal((await request(path,{headers:customer})).body.progress,'scheduled');
  assert.equal((await request(privatePhoto,{headers:customer})).status,200);
  assert.equal((await request('/api/admin/inventory',{headers:owner})).body.counts.documents,1);

  const archive=await environment.records().backup();
  assert.equal(archive.photos.length,1);
  assert.ok(!JSON.stringify(archive).includes(fixtureJob.email));
  const broken=structuredClone(archive);
  broken.photos[0].ciphertext+=' ';
  await assert.rejects(environment.records('preview-netlify-corrupt').restore(broken),/corrupt/);
  const restored=await environment.records('preview-netlify-restored').restore(archive);
  assert.equal(restored.jobs,1);assert.equal(restored.photos,1);assert.equal(restored.documents,1);
  await environment.stop();
  base=await environment.start('preview-netlify-restored');
  request=client(base);
  assert.equal((await request(path,{headers:customer})).body.invoice.number,invoice.body.invoice.number);
  assert.deepEqual((await request(privatePhoto,{headers:customer})).body,verifiedPhoto.body);
 }finally{await environment.close();}
});
