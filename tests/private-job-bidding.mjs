import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const jobRoutes=require('../job-routes.js');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const admin='local-test-owner-token';
const customerPhone='909-555-0421',customerEmail='testcustomer@example.invalid';
const fakeKey='b'.repeat(64);
const proTokens=['a'.repeat(64),'c'.repeat(64),'d'.repeat(64),'e'.repeat(64),'f'.repeat(64)];
const makeFixture=()=>{
 let records={
  profiles:proTokens.map((key,i)=>({id:i===0?'superior':'pro-'+i,
   name:i===0?'Superior Maintenance':'Local Renovations '+i,city:'Fontana',
   industry:'construction',services:['Drywall','Remodeling'],phone:'909-555-9876',website:'https://example.test'})),
  proAccess:proTokens.map((key,i)=>({profileId:i===0?'superior':'pro-'+i,tokenHash:hash(key)})),
  jobs:[],jobEntitlements:[]
 };
 async function request(method,url,payload={},headers={}){
  const res={body:null,status:null};
  const handled=await jobRoutes({url,method,headers,socket:{remoteAddress:'127.0.0.1'}},res,{
   db:()=>records,save:next=>{records=next},
   send:(response,status,json)=>{response.httpStatus=status;response.body=json},
   body:async()=>payload,admin:req=>req.headers['x-admin-token']===admin,
   clean:(v,max)=>String(v??'').trim().replace(/[<>]/g,'').slice(0,max),
   limited:()=>false
  });
  assert.equal(handled,true,'The job route was handled: '+url);
  return {...res.body,httpStatus:res.httpStatus};
 }
 async function postJob(limit=3,industry='construction'){
  return request('POST','/api/jobs',{industry,title:'Repair kitchen drywall',
   description:'Patch and repaint the damaged walls after plumbing repairs.',
   category:'Drywall',city:'Fontana, CA',name:'Private Customer',
   email:customerEmail,phone:customerPhone,address:'123 Example Street, Fontana',
   bidLimit:limit,consent:true,rulesAccepted:true});
 }
 async function authorize(profileIndex,tier='pro'){
  return request('POST','/api/admin/jobs/entitlements',{profileId:records.profiles[profileIndex].id,tier,confirmedInPayPal:true},{'x-admin-token':admin});
 }
 async function bid(profileIndex,id,amount=850){
  return request('POST','/api/pro/jobs/'+id+'/bids',{amount,scope:'Complete a careful drywall repair with labor and materials.',feeAcknowledged:true,rulesAccepted:true},
    {'x-pro-token':proTokens[profileIndex]});
 }
 return {request,postJob,authorize,bid,records:()=>records};
};
test('Public job requires privacy, consent, 1–3 customer-controlled estimate slots',async()=>{
 const f=makeFixture();
 const invalid=await f.request('POST','/api/jobs',{industry:'construction',title:'Please call 909-555-0421',
  description:'My kitchen wall needs repairs this weekend, please call me.',city:'Fontana, CA',
  name:'Private Person',email:customerEmail,bidLimit:1,consent:true});
 assert.equal(invalid.httpStatus,400);
 const tooMany=await f.postJob(4);assert.equal(tooMany.httpStatus,400);
 const missingRules=await f.request('POST','/api/jobs',{industry:'construction',title:'Drywall job',description:'Repair wall in the kitchen after pipe repair.',city:'Fontana, CA',name:'Customer',email:customerEmail,bidLimit:2,consent:true});
 assert.equal(missingRules.httpStatus,400);
 const posted=await f.postJob(2);assert.equal(posted.httpStatus,201);
 assert.match(posted.customerKey,/^[a-f0-9]{64}$/);
 assert.equal(f.records().jobs[0].customerKeyHash,hash(posted.customerKey));
 assert.equal(f.records().jobs[0].customerKey,undefined);
 assert.equal(f.records().jobs[0].customerRulesVersion,'2026-11-16');
 assert.ok(f.records().jobs[0].customerRulesAcceptedAt);
 const wrong=await f.request('GET','/api/jobs/'+posted.jobId,{}, {'x-customer-key':fakeKey});
 assert.equal(wrong.httpStatus,404);
 const privateView=await f.request('GET','/api/jobs/'+posted.jobId,{}, {'x-customer-key':posted.customerKey});
 assert.equal(privateView.httpStatus,200);
 assert.equal(privateView.customer.phone,customerPhone);
 const proView=await f.request('GET','/api/pro/jobs',{}, {'x-pro-token':proTokens[0]});
 assert.equal(proView.httpStatus,200);
 assert.equal(proView.jobs[0].customer,undefined);
 assert.equal(proView.jobs[0].customerContact,null);
 assert.ok(!JSON.stringify(proView).includes(customerPhone));
 assert.ok(!JSON.stringify(proView).includes(customerEmail));
 assert.ok(!JSON.stringify(proView).includes('123 Example'));
});
test('Credits require owner verification, apply before any PayPal charge, and enforce cap',async()=>{
 const f=makeFixture(),posted=await f.postJob(1);
 const deny=await f.bid(0,posted.jobId);assert.equal(deny.httpStatus,403);
 const badOwner=await f.request('POST','/api/admin/jobs/entitlements',{profileId:'superior',tier:'pro',confirmedInPayPal:true});
 assert.equal(badOwner.httpStatus,401);
 assert.equal((await f.authorize(0,'pro')).httpStatus,200);
 const pro=await f.request('GET','/api/pro/jobs',{}, {'x-pro-token':proTokens[0]});
 assert.equal(pro.credits.remaining,2);
 const first=await f.bid(0,posted.jobId);assert.equal(first.httpStatus,201);
 assert.equal(first.creditApplied,true);assert.equal(first.fee,0);assert.equal(first.paymentLink,null);
 assert.equal(f.records().jobs[0].bids[0].professionalRulesVersion,'2026-11-16');
 const customerView=await f.request('GET','/api/jobs/'+posted.jobId,{}, {'x-customer-key':posted.customerKey});
 assert.equal(customerView.bids.length,1);assert.equal(customerView.filledSlots,1);
 assert.equal((await f.authorize(1,'basic')).httpStatus,200);
 const over=await f.bid(1,posted.jobId);assert.equal(over.httpStatus,409);
 const secondJob=await f.postJob(3);const second=await f.bid(0,secondJob.jobId);
 assert.equal(second.creditApplied,true);
 const after=await f.request('GET','/api/pro/jobs',{}, {'x-pro-token':proTokens[0]});
 assert.equal(after.credits.remaining,0);
 const payment=await f.bid(0,(await f.postJob()).jobId);
 assert.equal(payment.creditApplied,false);assert.equal(payment.fee,18);
});
test('Paid bids are held privately until owner verifies PayPal; contact released to selected pro only',async()=>{
 const f=makeFixture(),posted=await f.postJob(2);
 await f.authorize(0,'basic');await f.authorize(1,'basic');
 const reserved=await f.bid(0,posted.jobId,1750);
 assert.equal(reserved.httpStatus,201);assert.equal(reserved.creditApplied,false);assert.equal(reserved.fee,18);
 assert.equal((await f.request('GET','/api/jobs/'+posted.jobId,{}, {'x-customer-key':posted.customerKey})).bids.length,0);
 const unverified=await f.request('POST','/api/admin/jobs/'+posted.jobId+'/bids/'+reserved.bidId+'/verify',{confirmedInPayPal:true},{'x-admin-token':admin});
 assert.equal(unverified.httpStatus,409);
 const reference=await f.request('POST','/api/pro/jobs/'+posted.jobId+'/bids/'+reserved.bidId+'/payment',
  {paymentReference:'PAYPAL-TEST-1234'},{'x-pro-token':proTokens[0]});
 assert.equal(reference.httpStatus,200);
 const withoutCheck=await f.request('POST','/api/admin/jobs/'+posted.jobId+'/bids/'+reserved.bidId+'/verify',
  {confirmedInPayPal:false},{'x-admin-token':admin});
 assert.equal(withoutCheck.httpStatus,400);
 const reviewed=await f.request('POST','/api/admin/jobs/'+posted.jobId+'/bids/'+reserved.bidId+'/verify',
  {confirmedInPayPal:true},{'x-admin-token':admin});
 assert.equal(reviewed.httpStatus,200);
 const bids=await f.request('GET','/api/jobs/'+posted.jobId,{}, {'x-customer-key':posted.customerKey});
 assert.equal(bids.bids.length,1);assert.equal(bids.bids[0].amount,1750);
 const unselected=await f.request('GET','/api/pro/jobs',{}, {'x-pro-token':proTokens[1]});
 assert.equal(unselected.jobs[0].customerContact,null);
 const choose=await f.request('POST','/api/jobs/'+posted.jobId+'/select',{bidId:reserved.bidId},{'x-customer-key':posted.customerKey});
 assert.equal(choose.httpStatus,200);
 const selected=await f.request('GET','/api/pro/jobs',{}, {'x-pro-token':proTokens[0]});
 assert.equal(selected.jobs[0].customerContact.email,customerEmail);
 assert.equal(selected.jobs[0].customerContact.address,'123 Example Street, Fontana');
 const stillPrivate=await f.request('GET','/api/pro/jobs',{}, {'x-pro-token':proTokens[1]});
 assert.equal(stillPrivate.jobs[0].customerContact,null);
 assert.equal((await f.bid(1,posted.jobId)).httpStatus,409);
});
test('Fourth estimate is not accepted unless the customer explicitly authorizes it after three verified bids',async()=>{
 const f=makeFixture(),posted=await f.postJob(3);
 for(let i=0;i<5;i++)await f.authorize(i,'pro');
 const early=await f.request('POST','/api/jobs/'+posted.jobId+'/fourth',{approveFourth:true},{'x-customer-key':posted.customerKey});
 assert.equal(early.httpStatus,409);
 for(let i=0;i<3;i++){const b=await f.bid(i,posted.jobId);assert.equal(b.httpStatus,201);assert.equal(b.creditApplied,true);}
 const denied=await f.bid(3,posted.jobId);assert.equal(denied.httpStatus,409);
 const noConsent=await f.request('POST','/api/jobs/'+posted.jobId+'/fourth',{approveFourth:false},{'x-customer-key':posted.customerKey});
 assert.equal(noConsent.httpStatus,400);
 const allowed=await f.request('POST','/api/jobs/'+posted.jobId+'/fourth',{approveFourth:true},{'x-customer-key':posted.customerKey});
 assert.equal(allowed.httpStatus,200);
 const fourth=await f.bid(3,posted.jobId);assert.equal(fourth.httpStatus,201);
 const after=await f.request('GET','/api/jobs/'+posted.jobId,{}, {'x-customer-key':posted.customerKey});
 assert.equal(after.bids.length,4);assert.equal(after.bidLimit,4);assert.equal(after.fourthApproved,true);
 assert.equal((await f.bid(4,posted.jobId)).httpStatus,409);
});
test('Passing hides job and expired holds cannot be charged or validated',async()=>{
 const f=makeFixture(),posted=await f.postJob(1);
 await f.authorize(0,'basic');await f.authorize(1,'basic');
 const reserve=await f.bid(0,posted.jobId);assert.equal(reserve.httpStatus,201);
 assert.equal((await f.bid(1,posted.jobId)).httpStatus,409);
 f.records().jobs[0].bids[0].expiresAt='2020-01-01T00:00:00Z';
 const expired=await f.request('POST','/api/pro/jobs/'+posted.jobId+'/bids/'+reserve.bidId+'/payment',
  {paymentReference:'PAYPAL-TEST-1234'},{'x-pro-token':proTokens[0]});
 assert.equal(expired.httpStatus,409);
 const other=await f.bid(1,posted.jobId);assert.equal(other.httpStatus,201);
 const pass=await f.request('POST','/api/pro/jobs/'+posted.jobId+'/pass',{}, {'x-pro-token':proTokens[1]});
 assert.equal(pass.httpStatus,200);
 const feed=await f.request('GET','/api/pro/jobs',{}, {'x-pro-token':proTokens[1]});
 assert.equal(feed.jobs.length,0);
});
