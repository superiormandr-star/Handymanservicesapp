import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';

async function availablePort(){const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const port=s.address().port;await new Promise(r=>s.close(r));return port}
async function pause(ms){return new Promise(r=>setTimeout(r,ms))}
async function request(base,path,options={}){const res=await fetch(base+path,options);let out;try{out=await res.json()}catch{out={}}return {status:res.status,body:out}}
const json=(data,headers={})=>({method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(data)});
test('Handyman Services main business-directory flows',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'handyman-tests-')); const port=await availablePort();const base=`http://127.0.0.1:${port}`;
 const admin='test-secret-long-token';const proc=spawn(process.execPath,['server.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:String(port),DATA_FILE:join(dir,'data.json'),ADMIN_TOKEN:admin}});
 try{
  let started=false;for(let i=0;i<60;i++){try{const r=await request(base,'/api/health');if(r.status===200){started=true;break}}catch{}await pause(100)}assert.ok(started,'server starts');
  for(const route of ['/','/styles.css','/app.js','/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png','/handyman-logo.png','/superior-logo.png','/admin.html','/admin.js','/privacy.html','/terms.html']){const r=await fetch(base+route);assert.equal(r.status,200,route)}
  let r=await request(base,'/api/profiles');assert.equal(r.status,200);assert.equal(r.body.profiles[0].name,'Superior Maintenance and Remodeling');assert.ok(r.body.profiles[0].logo);
  r=await request(base,'/api/reviews?profile=superior');assert.equal(r.body.total,0);
  r=await request(base,'/api/reviews',json({profileId:'superior',name:'Test Customer',stars:5,comment:'The contractor was courteous and did quality work.'}));assert.equal(r.status,201);
  r=await request(base,'/api/reviews?profile=superior');assert.equal(r.body.total,0,'pending review stays private');
  r=await request(base,'/api/admin/pending');assert.equal(r.status,401);
  const headers={'x-admin-token':admin};r=await request(base,'/api/admin/pending',{headers});assert.equal(r.status,200);assert.equal(r.body.reviews.length,1);
  const id=r.body.reviews[0].id;
  r=await request(base,'/api/admin/review',json({id,status:'approved'},headers));assert.equal(r.status,200);
  r=await request(base,'/api/admin/reply',json({id,reply:'Thank you for your feedback!'},headers));assert.equal(r.status,200);
  r=await request(base,'/api/reviews?profile=superior');assert.equal(r.body.total,1);assert.equal(r.body.average,5);assert.equal(r.body.reviews[0].ownerReply,'Thank you for your feedback!');
  r=await request(base,'/api/admin/reviews',{headers});assert.equal(r.body.reviews.length,1);
  r=await request(base,'/api/join',json({business:'Test Services LLC',email:'test@example.com',city:'Austin, TX',phone:'5555550123',services:'Painting, Carpentry',coverageMode:'cities',coverageAreas:'Austin, Round Rock, Travis County'}));assert.equal(r.status,201);const requestId=r.body.requestId;const checkoutToken=r.body.checkoutToken;
  r=await request(base,'/api/subscription',json({requestId,subscriptionId:'I-EXAMPLE123456'}));assert.equal(r.status,409);
  r=await request(base,'/api/paypal/verify',json({requestId,checkoutToken,subscriptionId:'I-EXAMPLE123456'}));assert.equal(r.status,503);
  r=await request(base,'/api/admin/pending',{headers});assert.equal(r.body.intake[0].status,'interest');assert.deepEqual(r.body.intake[0].coverageAreas,['Austin','Round Rock','Travis County']);assert.deepEqual(r.body.intake[0].services,['Painting','Carpentry']);
  r=await request(base,'/api/admin/intake',json({id:requestId,status:'verified'},headers));assert.equal(r.status,200);
  r=await request(base,'/api/admin/profile',json({id:'superior',name:'Superior Maintenance and Remodeling',city:'Fontana',services:['Painting']},headers));assert.equal(r.status,200);assert.equal(r.body.profile.logo,'/superior-logo.png','profile edit retains the original Superior Maintenance and Remodeling logo');
  r=await request(base,'/api/join',json({business:'Radius Pro LLC',email:'radius@example.com',city:'Denver, CO',services:'Repairs',coverageMode:'radius',coverageZip:'80202',coverageRadius:50}));assert.equal(r.status,201);
  r=await request(base,'/api/join',json({business:'Bad Radius LLC',email:'bad@example.com',city:'Denver, CO',services:'Repairs',coverageMode:'radius',coverageZip:'8020',coverageRadius:50}));assert.equal(r.status,400);
  r=await request(base,'/api/join',json({business:'States Pro LLC',email:'states@example.com',city:'Phoenix, AZ',services:'Remodeling',coverageMode:'states',coverageStates:'Arizona, Nevada'}));assert.equal(r.status,201);
  const db=JSON.parse(readFileSync(join(dir,'data.json'),'utf8'));assert.equal(db.intake[0].status,'verified');
 }finally{proc.kill('SIGTERM');rmSync(dir,{force:true,recursive:true})}
});