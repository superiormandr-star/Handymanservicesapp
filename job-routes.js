'use strict';
const crypto=require('node:crypto');
const paymentLinks={
 construction:'https://www.paypal.com/ncp/payment/ED9BM6N9TVJMC',
 automotive:'https://www.paypal.com/ncp/payment/SCXVVGDZU6LE2'
};
const fee={construction:18,automotive:10};
const uid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
const currency=n=>Math.round(n*100)/100;
const validEmail=s=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const expires=(minutes,base)=>new Date(base+minutes*60000).toISOString();
const identifyingText=s=>/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(s) ||
 /(?:(?:\+?1)[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/.test(s) ||
 /\b\d{1,6}\s+(?:[a-zA-Z0-9]+\s+){0,3}(?:street|st|road|rd|avenue|ave|boulevard|blvd|drive|dr|lane|ln|court|ct|way)\b/i.test(s);
const active=(b,time)=>b.status==='verified'||b.status==='selected'||(b.status==='pending' && Date.parse(b.expiresAt)>time);
const validCount=(job,time)=>job.bids.filter(b=>active(b,time)).length;
const currentBids=job=>job.bids.filter(b=>b.status==='verified'||b.status==='selected');
const matchingIndustry=(profile,industry)=>{
 const explicit=String(profile.industry||profile.category||'').toLowerCase();
 if(['automotive','construction'].includes(explicit))return explicit===industry;
 const all=[profile.name,...(Array.isArray(profile.services)?profile.services:[])].join(' ');
 const auto=/automotive|auto repair|mechanic|vehicle|brakes|suspension|transmission|engine repair|diagnostic|tire|body shop|detailing|oil change/i;
 return industry==='automotive'?auto.test(all):profile.id==='superior'||!auto.test(all);
};
const info=(job,time)=>({
 id:job.id,industry:job.industry,title:job.title,description:job.description,
 city:job.city,category:job.category,createdAt:job.createdAt,status:job.status,
 bidLimit:job.bidLimit,filledSlots:validCount(job,time),remainingSlots:Math.max(0,job.bidLimit-validCount(job,time)),
 fourthApproved:Boolean(job.fourthApproved)
});
module.exports=async function jobRoutes(req,res,ctx){
 const {db,save,send,body,admin,clean,limited}=ctx;
 const route=new URL(req.url,'http://localhost').pathname;
 if(route!=='/api/jobs'&&!route.startsWith('/api/jobs/')&&
    route!=='/api/pro/jobs'&&!route.startsWith('/api/pro/jobs/')&&
    route!=='/api/admin/jobs'&&!route.startsWith('/api/admin/jobs/'))return false;
 const reply=(s,p)=>{send(res,s,p);return true};
 const fail=(msg,status=400)=>reply(status,{error:msg});
 const when=Date.now(),timestamp=new Date(when).toISOString();
 const data=db();
 const jobs=Array.isArray(data.jobs)?data.jobs:[];
 const secureCustomer=job=>{
  const key=req.headers['x-customer-key'];
  if(typeof key!=='string'||!/^[a-f0-9]{64}$/i.test(key))return false;
  return crypto.timingSafeEqual(Buffer.from(digest(key)),Buffer.from(job.customerKeyHash));
 };
 const pro=()=>{
  const key=req.headers['x-pro-token'];
  if(typeof key!=='string'||!/^[a-f0-9]{64}$/i.test(key))return null;
  const hash=digest(key),link=(data.proAccess||[]).find(a=>a.tokenHash===hash);
  return link?data.profiles.find(p=>p.id===link.profileId)||null:null;
 };
 if(route==='/api/jobs'&&req.method==='POST'){
  if(limited(req))return fail('Too many submissions. Try later.',429);
  const input=await body(req);
  if(input.website)return reply(200,{ok:true,message:'Request received.'});
  const industry=clean(input.industry,24),title=clean(input.title,100),description=clean(input.description,2200);
  const category=clean(input.category,70),city=clean(input.city,100);
  const name=clean(input.name,100),email=clean(input.email,180),phone=clean(input.phone,40),address=clean(input.address,180);
  const limit=Number(input.bidLimit);
  if(!['construction','automotive'].includes(industry))return fail('Choose Construction or Automotive.');
  if(title.length<5||description.length<20||city.length<2||name.length<2)return fail('Enter a job title, description (20+ characters), general city and your name.');
  if(![1,2,3].includes(limit))return fail('Choose one, two or three estimates.');
  if((email&&!validEmail(email))||(!validEmail(email)&&phone.replace(/\D/g,'').length<7))return fail('Enter a valid email or telephone number.');
  if(identifyingText(title+' '+description+' '+city))return fail('Remove phone numbers, email addresses and street addresses from public job details. Use the private contact fields.');
  if(input.consent!==true)return fail('Consent to storing your job and sending details to eligible network professionals is required.');
  const customerKey=crypto.randomBytes(32).toString('hex');
  const job={id:crypto.randomUUID(),industry,title,description,category,city,customer:{name,email,phone,address},
   customerKeyHash:digest(customerKey),bidLimit:limit,fourthApproved:false,status:'open',selectedBidId:null,
   bids:[],passes:[],createdAt:timestamp,updatedAt:timestamp};
  data.jobs=jobs;data.jobs.push(job);save(data);
  return reply(201,{ok:true,jobId:job.id,customerKey,job:info(job,when),
   message:'Your private job has been posted. Save the private management link; it is needed to review bids and choose a professional.'});
 }
 const customerRoute=route.match(/^\/api\/jobs\/([0-9a-f-]{36})(?:\/(select|close|fourth))?$/i);
 if(customerRoute){
  const job=jobs.find(j=>j.id===customerRoute[1]);
  if(!job||!secureCustomer(job))return fail('Job not found or private customer link is invalid.',404);
  const command=customerRoute[2];
  if(!command&&req.method==='GET'){
   const selected=job.bids.find(b=>b.id===job.selectedBidId && b.status==='selected');
   return reply(200,{...info(job,when),
    customer:{name:job.customer.name,email:job.customer.email,phone:job.customer.phone,address:job.customer.address},
    bids:currentBids(job).map(b=>{
     const provider=data.profiles.find(p=>p.id===b.profileId);
     return {id:b.id,amount:b.amount,scope:b.scope,submittedAt:b.verifiedAt,
      professional:provider?{name:provider.name,city:provider.city,services:provider.services}: {name:'Listed professional'}};
    }),
    selectedBidId:job.selectedBidId,
    selectedProfessional:selected?(()=>{
     const p=data.profiles.find(p=>p.id===selected.profileId);
     return p?{name:p.name,phone:p.phone||'',website:p.website||'',city:p.city||''}:null;
    })():null
   });
  }
  if(req.method!=='POST')return fail('Method not allowed.',405);
  if(job.status!=='open')return fail('This job is no longer accepting changes.',409);
  if(command==='select'){
   const input=await body(req),bid=job.bids.find(b=>b.id===input.bidId && b.status==='verified');
   if(!bid)return fail('Choose a verified estimate from your private dashboard.');
   bid.status='selected';job.selectedBidId=bid.id;job.status='selected';job.updatedAt=timestamp;save(data);
   return reply(200,{ok:true,message:'Professional selected. Only the selected professional can now view your private contact details.'});
  }
  if(command==='close'){
   job.status='closed';job.updatedAt=timestamp;save(data);
   return reply(200,{ok:true,message:'Job closed. No further estimates will be accepted.'});
  }
  if(command==='fourth'){
   if(job.bidLimit!==3||job.fourthApproved)return fail('A fourth estimate can only be authorized once after choosing a three-estimate limit.',409);
   if(validCount(job,when)<3)return fail('The first three estimate slots must be filled before a fourth can be authorized.',409);
   const input=await body(req);
   if(input.approveFourth!==true)return fail('Explicit approval is required for a fourth estimate.');
   job.bidLimit=4;job.fourthApproved=true;job.updatedAt=timestamp;save(data);
   return reply(200,{ok:true,message:'You explicitly authorized one additional estimate. The fourth is the last permitted slot.'});
  }
  return fail('Unknown job operation.',404);
 }
 if(route==='/api/pro/jobs'||route.startsWith('/api/pro/jobs/')){
  const profile=pro();if(!profile)return fail('Professional access required.',401);
  if(route==='/api/pro/jobs'&&req.method==='GET'){
   const own=jobs.filter(j=>matchingIndustry(profile,j.industry)&&!(j.passes||[]).includes(profile.id));
   return reply(200,{professional:{id:profile.id,name:profile.name},jobs:own.map(j=>{
    const ownBid=j.bids.find(b=>b.profileId===profile.id&&active(b,when));
    const selectedForMe=j.status==='selected'&&j.selectedBidId===ownBid?.id;
    return {...info(j,when),ownBid:ownBid?{id:ownBid.id,status:ownBid.status,amount:ownBid.amount,
     scope:ownBid.scope,paymentReference:ownBid.paymentReference||null,
     expiresAt:ownBid.expiresAt,fee:fee[j.industry],paymentLink:paymentLinks[j.industry]}:null,
     customerContact:selectedForMe?j.customer:null};
   })});
  }
  const match=route.match(/^\/api\/pro\/jobs\/([0-9a-f-]{36})\/(pass|bids)(?:\/([0-9a-f-]{36})\/payment)?$/i);
  if(!match||req.method!=='POST')return fail('Method not allowed.',405);
  const job=jobs.find(j=>j.id===match[1]);
  if(!job||!matchingIndustry(profile,job.industry))return fail('This job is not available to your professional workspace.',404);
  if(match[2]==='pass'){
   if(!(job.passes||[]).includes(profile.id)){job.passes.push(profile.id);job.updatedAt=timestamp;save(data);}
   return reply(200,{ok:true,message:'Passed. This job has been hidden from your available opportunities.'});
  }
  if(match[3]){
   const bid=job.bids.find(b=>b.id===match[3]&&b.profileId===profile.id);
   if(!bid||bid.status!=='pending'||Date.parse(bid.expiresAt)<=when)return fail('Bid reservation expired or was not found.',409);
   const input=await body(req);
   const reference=clean(input.paymentReference,80);
   if(!/^[A-Za-z0-9-]{6,80}$/.test(reference))return fail('Enter the PayPal transaction ID from your receipt for owner verification.');
   if(bid.paymentReference && bid.paymentReference!==reference)return fail('Payment reference already submitted; contact the owner for correction.',409);
   bid.paymentReference=reference;bid.expiresAt=expires(1440,when);bid.updatedAt=timestamp;save(data);
   return reply(200,{ok:true,message:'Payment reference recorded for manual owner verification. The estimate remains private until payment is verified.'});
  }
  if(job.status!=='open')return fail('This job is no longer open for estimates.',409);
  if((job.passes||[]).includes(profile.id))return fail('You passed on this job.',409);
  if(job.bids.some(b=>b.profileId===profile.id && active(b,when)))return fail('You already hold an estimate slot for this job.',409);
  if(validCount(job,when)>=job.bidLimit)return fail('The customer estimate limit has been reached. No extra bid was accepted.',409);
  const input=await body(req),amount=Number(input.amount),scope=clean(input.scope,1800);
  if(!Number.isFinite(amount)||amount<=0||amount>100000000||scope.length<15)return fail('Enter a positive estimate amount and at least 15 characters of scope.');
  if(input.feeAcknowledged!==true)return fail('Review and acknowledge the per-estimate fee first.');
  const bid={id:crypto.randomUUID(),profileId:profile.id,amount:currency(amount),scope,status:'pending',
   fee:fee[job.industry],paymentReference:null,createdAt:timestamp,updatedAt:timestamp,expiresAt:expires(30,when)};
  job.bids.push(bid);job.updatedAt=timestamp;save(data);
  return reply(201,{ok:true,bidId:bid.id,fee:bid.fee,paymentLink:paymentLinks[job.industry],
   expiresAt:bid.expiresAt,
   message:'Estimate slot reserved for 30 minutes. Pay the listed one-time fee and submit the receipt transaction ID. The estimate is not delivered to the customer until the owner verifies payment.'});
 }
 if(route==='/api/admin/jobs'||route.startsWith('/api/admin/jobs/')){
  if(!admin(req))return fail('Owner access required.',401);
  if(route==='/api/admin/jobs'&&req.method==='GET'){
   return reply(200,{jobs:jobs.map(job=>({
    ...info(job,when),customer:job.customer,selectedBidId:job.selectedBidId,
    bids:job.bids.map(b=>({...b,professional:data.profiles.find(p=>p.id===b.profileId)?.name||'Unknown'}))
   }))});
  }
  const match=route.match(/^\/api\/admin\/jobs\/([0-9a-f-]{36})\/bids\/([0-9a-f-]{36})\/(verify|reject)$/i);
  if(!match||req.method!=='POST')return fail('Method not allowed.',405);
  const job=jobs.find(j=>j.id===match[1]),bid=job?.bids.find(b=>b.id===match[2]);
  if(!job||!bid)return fail('Job or bid not found.',404);
  if(bid.status!=='pending')return fail('Only pending estimates can be reviewed.',409);
  if(match[3]==='verify'){
   if(job.status!=='open')return fail('This job has already closed.',409);
   if(!bid.paymentReference)return fail('PayPal transaction reference is required before verification.',409);
   if(Date.parse(bid.expiresAt)<=when)return fail('Reservation expired. Do not approve or charge against an expired slot.',409);
   if(validCount(job,when)>job.bidLimit)return fail('Customer estimate limit reached. Do not accept an extra estimate.',409);
   const input=await body(req);
   if(input.confirmedInPayPal!==true)return fail('Confirm the matching fee and transaction independently in PayPal before approving.');
   bid.status='verified';bid.verifiedAt=timestamp;bid.updatedAt=timestamp;
  }else{bid.status='rejected';bid.updatedAt=timestamp;}
  job.updatedAt=timestamp;save(data);
  return reply(200,{ok:true,message:match[3]==='verify'?'Payment marked independently verified; estimate released privately to the customer.':'Estimate rejected; it will not be shown to the customer.'});
 }
 return fail('Not found.',404);
};
