import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/worker.mjs';

function mockDb(){
 const records=new Map();
 return {
  records,
  prepare(sql){
   let bound=[];
   return {
    bind(...values){bound=values;return this;},
    async run(){
     if(sql.startsWith('INSERT INTO spc2_applications')){
      const [id,business,email,city,phone,industry,tier,services_json,coverage_mode,coverage_json,payment_status,status,access_hash,created_at]=bound;
      records.set(id,{id,business,email,city,phone,industry,tier,services_json,coverage_mode,coverage_json,payment_status,status,access_hash,created_at});
     }
     return {success:true};
    },
    async first(){
     if(sql.startsWith('SELECT industry,tier,status,payment_status,access_hash')){
      const row=records.get(bound[0]);
      return row?{industry:row.industry,tier:row.tier,status:row.status,payment_status:row.payment_status,access_hash:row.access_hash}:null;
     }
     if(sql==='SELECT 1 AS ok')return {ok:1};
     throw Error('Unexpected SQL first: '+sql);
    },
    async all(){
     if(sql.startsWith('SELECT id,business,city,industry,services_json')){
      return {results:[...records.values()].filter(x=>x.status==='active'&&x.payment_status==='confirmed')};
     }
     throw Error('Unexpected SQL all: '+sql);
    }
   }
  }
 };
}
const base='https://superior-proconnect-2.superiormandr.workers.dev';
test('Cloudflare membership enrollment persists, requires private key, and never grants unpaid access',async()=>{
 const DB=mockDb(),env={DB,ASSETS:{fetch:()=>new Response('not found',{status:404})}};
 const payload={business:'Test Provider',city:'Fontana, CA',email:'owner@example.test',industry:'automotive',
  membership:'professional',services:'Brakes and tires',coverageMode:'cities',coverageAreas:'Fontana'};
 const request=(path,options={})=>new Request(base+path,options);
 const wrong=await worker.fetch(request('/api/join',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...payload,membership:'unknown'})}),env);
 assert.equal(wrong.status,400);
 const enrollment=await worker.fetch(request('/api/join',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}),env);
 assert.equal(enrollment.status,201);
 const data=await enrollment.json();
 assert.equal(data.packageKey,'automotive-professional');
 assert.match(data.checkoutUrl,/^https:\/\/www\.paypal\.com\/webapps\/billing\/plans\/subscribe\?plan_id=P-/);
 assert.equal(DB.records.size,1);
 let result=await worker.fetch(request('/api/membership/status?id='+data.requestId,{headers:{'x-membership-key':data.accessKey}}),env);
 assert.equal(result.status,200);
 assert.deepEqual((await result.json()).active,false);
 result=await worker.fetch(request('/api/membership/status?id='+data.requestId,{headers:{'x-membership-key':'0'.repeat(64)}}),env);
 assert.equal(result.status,404);
 result=await worker.fetch(request('/api/profiles'),env);
 assert.equal(result.status,200);
 const listingProfiles=(await result.json()).profiles;
 assert.equal(listingProfiles.length,2);
 const automotive=listingProfiles.find(p=>p.id==='best-wrench-works');
 assert.equal(automotive.name,'Best Wrench Worx LLC');
 assert.equal(automotive.industry,'automotive');
 assert.equal(automotive.ownerListed,true);
 assert.equal(automotive.featured,true);
 assert.equal(automotive.verified,false);
 assert.equal(listingProfiles[0].id,'superior');
 assert.equal(listingProfiles[0].industry,'construction');
 assert.equal(listingProfiles[0].ownerListed,true);
 assert.equal(listingProfiles[0].featured,true);
 assert.equal(listingProfiles[0].verified,false);
 result=await worker.fetch(request('/api/paypal/webhook',{method:'POST',body:'{}'}),env);
 assert.equal(result.status,503);
 result=await worker.fetch(request('/api/health'),env);
 assert.equal(result.status,200);
});
