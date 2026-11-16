'use strict';
const crypto=require('node:crypto');
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function redact(job){
 const {id,industry,category,description,city,preferredDate,status,createdAt,bidLimit}=job;
 return {id,industry,category,description,city,preferredDate,status,createdAt,bidLimit};
}
module.exports=async function privateJobs(req,res,{db,save,send,body,admin,clean,limited}){
 const path=new URL(req.url,'http://localhost').pathname;
 if(!path.startsWith('/api/customer-jobs'))return false;
 const reply=(code,value)=>{send(res,code,value);return true;};
 if(path==='/api/customer-jobs'&&req.method==='POST'){
  // Job submissions must never be acknowledged until backed by durable writes.
  if(process.env.VERCEL&&!process.env.SPC_MEMBERSHIP_TRANSACTIONAL_BACKEND)
   return reply(503,{error:'Secure job posting is not available until durable storage is verified. No job was saved or payment taken.'});
  if(limited(req))return reply(429,{error:'Too many submissions'});
  const x=await body(req);
  if(x.website)return reply(202,{ok:true});
  const industry=clean(x.industry,24),category=clean(x.category,90),
   description=clean(x.description,2500),city=clean(x.city,90),address=clean(x.address,200),
   name=clean(x.name,100),email=clean(x.email,180),phone=clean(x.phone,40),
   preferredDate=clean(x.preferredDate,30),limit=Number(x.bidLimit||3);
  if(!['construction','automotive'].includes(industry)||category.length<2||
    description.length<20||city.length<2||name.length<2||
    ![1,2,3].includes(limit)||(!emailPattern.test(email)&&phone.replace(/\D/g,'').length<7))
   return reply(400,{error:'Check your job details, contact information and bid limit.'});
  if(x.customerConsent!==true)return reply(400,{error:'Customer consent required before storing contact details.'});
  const d=db();d.customerJobs=Array.isArray(d.customerJobs)?d.customerJobs:[];
  const record={id:crypto.randomUUID(),industry,category,description,city,preferredDate,
   bidLimit:limit,status:'pending_owner_review',createdAt:new Date().toISOString(),
   name,email,phone,address,shareContact:false,shareContactAuthorizedAt:null,
   selectedProIds:[],bids:[],customerConsentAt:new Date().toISOString()};
  d.customerJobs.push(record);save(d);
  return reply(201,{ok:true,jobId:record.id,status:record.status,
    message:'Job received for private review. Your contact details have not been shared with professionals.'});
 }
 if(path==='/api/customer-jobs'&&req.method==='GET'){
  // No public job listing; the only available read is owner-authenticated and redacted.
  if(!admin(req))return reply(401,{error:'Owner access required'});
  return reply(200,{jobs:(db().customerJobs||[]).map(redact)});
 }
 if(path==='/api/customer-jobs/private'&&req.method==='GET'){
  if(!admin(req))return reply(401,{error:'Owner access required'});
  return reply(200,{jobs:db().customerJobs||[]});
 }
 return reply(405,{error:'Method not allowed'});
};
