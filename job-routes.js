'use strict';
const crypto=require('node:crypto');
const {professionalAccess,tokenMatches,tokenHash}=require('./pro-access');
const {readBytes}=require('./request-body');
const {maxBytes,maxPhotos}=require('./job-photos');
const paymentLinks={
 construction:'https://www.paypal.com/ncp/payment/ED9BM6N9TVJMC',
 automotive:'https://www.paypal.com/ncp/payment/SCXVVGDZU6LE2'
};
const fee={construction:18,automotive:10};
const rulesVersion='2026-11-16';
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
 city:job.city,category:job.category,measurements:job.measurements||'',createdAt:job.createdAt,status:job.status,progress:job.progress||null,
 bidLimit:job.bidLimit,filledSlots:validCount(job,time),remainingSlots:Math.max(0,job.bidLimit-validCount(job,time)),
 fourthApproved:Boolean(job.fourthApproved)
});
module.exports=async function jobRoutes(req,res,ctx){
 const {db,save,send,body,admin,clean,limited,photos,paypal}=ctx;
 const route=new URL(req.url,'http://localhost').pathname;
 if(route!=='/api/jobs'&&!route.startsWith('/api/jobs/')&&
    route!=='/api/pro/jobs'&&!route.startsWith('/api/pro/jobs/')&&
    route!=='/api/admin/jobs'&&!route.startsWith('/api/admin/jobs/'))return false;
 const reply=(s,p)=>{send(res,s,p);return true};
 const fail=(msg,status=400)=>reply(status,{error:msg});
 const when=Date.now(),timestamp=new Date(when).toISOString();
 const data=db();
 const jobs=Array.isArray(data.jobs)?data.jobs:[];
 const entitlements=Array.isArray(data.jobEntitlements)?data.jobEntitlements:[];
 const billingMonth=timestamp.slice(0,7);
 const entitlementFor=profileId=>entitlements.find(e=>e.profileId===profileId&&e.period===billingMonth&&e.verified===true)||null;
 const access=professionalAccess(data,req.headers['x-pro-token']);
 const creditsFor=profileId=>{
  const membership=access?.membership;
  if(membership && !access.active)return null;
  const entitlement=entitlementFor(profileId);
  const credits=membership?.paypalCheckout?.estimateCredits;
  if(!Number.isSafeInteger(credits) && !entitlement)return null;
  const tier=membership?.membership||entitlement.tier;
  const allowed=Number.isSafeInteger(credits)?credits:({basic:0,pro:2,elite:5}[tier]||0);
  const period=membership?.lastPaymentId||billingMonth;
  const used=jobs.flatMap(j=>j.bids||[]).filter(b=>b.profileId===profileId&&b.creditUsed===true&&b.creditPeriod===period&&['verified','selected','pending'].includes(b.status)).length;
  return {tier,allowed,used,remaining:Math.max(0,allowed-used),period};
 };
 const secureCustomer=job=>tokenMatches(req.headers['x-customer-key'],job.customerKeyHash);
 const selectedFor=job=>job.bids.find(b=>b.id===job.selectedBidId&&b.status==='selected');
 const invoiceFor=job=>(data.documents||[]).find(document=>document.type==='invoice'&&document.sourceJobId===job.id);
 const invoiceSummary=job=>{
  const invoice=invoiceFor(job);
  return invoice?{number:invoice.number,issuer:invoice.issuer,total:invoice.total,status:invoice.status,scope:invoice.scope,createdAt:invoice.createdAt}:null;
 };
 const photoRoute=route.match(/^\/api\/(jobs|pro\/jobs|admin\/jobs)\/([a-f0-9-]{36})\/photos(?:\/([a-f0-9]{64}))?$/);
 if(photoRoute){
  const [,group,jobId,photoId]=photoRoute,job=jobs.find(j=>j.id===jobId);
  if(!job)return fail('Photo not found.',404);
  const owner=group==='admin/jobs'&&admin(req);
  const customer=group==='jobs'&&secureCustomer(job);
  const professional=group==='pro/jobs'&&job.sharePhotos===true&&access&&selectedFor(job)?.profileId===access.profile.id;
  if(!owner&&!customer&&!professional)return fail('Photo not found.',404);
  if(!photos?.enabled)return fail('Private photo storage is unavailable.',503);
  const references=job.photos||[];
  if(req.method==='GET'&&photoId){
   if(!references.some(photo=>photo.id===photoId))return fail('Photo not found.',404);
   const bytes=await photos.get(job.id,photoId);
   if(!bytes)return fail('Photo not found.',404);
   res.writeHead(200,{'content-type':'image/jpeg','cache-control':'private, no-store',
    'x-content-type-options':'nosniff','cross-origin-resource-policy':'same-origin'});
   res.end(bytes);
   return true;
  }
  if(req.method==='POST'&&!photoId&&customer){
   if(!['open','selected'].includes(job.status)||job.progress==='completed')return fail('This job no longer accepts photos.',409);
   if(references.length>=maxPhotos)return fail('This job already has three photos.',409);
   if(req.headers['content-type']!=='image/jpeg')return fail('Upload a JPEG photo.',415);
   const photo=await photos.put(job.id,await readBytes(req,maxBytes));
   if(references.some(existing=>existing.id===photo.id))return reply(200,{photo});
   job.photos=[...references,photo];
   job.updatedAt=timestamp;
   save(data);
   return reply(201,{photo});
  }
  return fail('Method not allowed.',405);
 }
 if(route==='/api/jobs'&&req.method==='POST'){
  if(limited(req))return fail('Too many submissions. Try later.',429);
  const input=await body(req);
  if(input.website)return reply(200,{ok:true,message:'Request received.'});
  const industry=clean(input.industry,24),title=clean(input.title,100),description=clean(input.description,2200);
  const category=clean(input.category,70),city=clean(input.city,100),measurements=clean(input.measurements,500);
  const name=clean(input.name,100),email=clean(input.email,180),phone=clean(input.phone,40),address=clean(input.address,180);
  const limit=Number(input.bidLimit);
  if(!['construction','automotive'].includes(industry))return fail('Choose Construction or Automotive.');
  if(title.length<5||description.length<20||city.length<2||name.length<2)return fail('Enter a job title, description (20+ characters), general city and your name.');
  if(![1,2,3].includes(limit))return fail('Choose one, two or three estimates.');
  if((email&&!validEmail(email))||(!validEmail(email)&&phone.replace(/\D/g,'').length<7))return fail('Enter a valid email or telephone number.');
  if(identifyingText([title,description,city,category,measurements].join(' ')))return fail('Remove phone numbers, email addresses and street addresses from public job details. Use the private contact fields.');
  if(input.consent!==true)return fail('Consent to storing your job and sending details to eligible network professionals is required.');
  if(input.rulesAccepted!==true)return fail('Accept the Rules & Regulations and Terms of Use before posting.');
  const customerKey=crypto.randomBytes(32).toString('hex');
  const job={id:crypto.randomUUID(),industry,title,description,category,city,measurements,customer:{name,email,phone,address},
   customerKeyHash:tokenHash(customerKey),customerRulesVersion:rulesVersion,customerRulesAcceptedAt:timestamp,bidLimit:limit,fourthApproved:false,status:'open',selectedBidId:null,
   bids:[],passes:[],photos:[],sharePhotos:input.sharePhotos===true,createdAt:timestamp,updatedAt:timestamp};
  data.jobs=jobs;data.jobs.push(job);save(data);
  return reply(201,{ok:true,jobId:job.id,customerKey,job:info(job,when),
   message:'Your private job has been posted. Save the private management link; it is needed to review bids and choose a professional.'});
 }
 const customerRoute=route.match(/^\/api\/jobs\/([0-9a-f-]{36})(?:\/(select|close|fourth|decline|clarify|share-photos))?$/i);
 if(customerRoute){
  const job=jobs.find(j=>j.id===customerRoute[1]);
  if(!job||!secureCustomer(job))return fail('Job not found or private customer link is invalid.',404);
  const command=customerRoute[2];
  if(!command&&req.method==='GET'){
   const selected=job.bids.find(b=>b.id===job.selectedBidId && b.status==='selected');
   return reply(200,{...info(job,when),
    photos:job.photos||[],sharePhotos:job.sharePhotos===true,photoUploadsAvailable:Boolean(photos?.enabled),invoice:invoiceSummary(job),
    customer:{name:job.customer.name,email:job.customer.email,phone:job.customer.phone,address:job.customer.address},
    bids:currentBids(job).map(b=>{
     const provider=data.profiles.find(p=>p.id===b.profileId);
     return {id:b.id,amount:b.amount,scope:b.scope,submittedAt:b.verifiedAt,decision:b.decision||null,clarification:b.clarification||null,
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
  if(command==='share-photos'){
   const input=await body(req);
   if(typeof input.sharePhotos!=='boolean'||job.status==='closed')return fail('Choose whether to share job photos.');
   job.sharePhotos=input.sharePhotos;
   job.photoConsentAt=input.sharePhotos?timestamp:null;
   job.updatedAt=timestamp;save(data);
   return reply(200,{ok:true});
  }
  if(job.status!=='open')return fail('This job is no longer accepting changes.',409);
  if(command==='decline'||command==='clarify'){
   const input=await body(req),bid=job.bids.find(b=>b.id===input.bidId&&b.status==='verified'&&!b.decision);
   if(!bid)return fail('This estimate is no longer awaiting your review.',409);
   if(command==='decline')bid.decision='declined';
   else{
    const question=clean(input.question,500);
    if(question.length<5||identifyingText(question))return fail('Enter a question without private contact details.');
    if(bid.clarification&&!bid.clarification.answer)return fail('This estimate already has a pending question.',409);
    bid.clarification={question,askedAt:timestamp};
   }
   job.updatedAt=timestamp;save(data);
   return reply(200,{ok:true});
  }
  if(command==='select'){
   const input=await body(req),bid=job.bids.find(b=>b.id===input.bidId&&b.status==='verified'&&!b.decision);
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
   if(currentBids(job).length<3)return fail('The customer must receive three verified estimates before authorizing a fourth.',409);
   const input=await body(req);
   if(input.approveFourth!==true)return fail('Explicit approval is required for a fourth estimate.');
   job.bidLimit=4;job.fourthApproved=true;job.updatedAt=timestamp;save(data);
   return reply(200,{ok:true,message:'You explicitly authorized one additional estimate. The fourth is the last permitted slot.'});
  }
  return fail('Unknown job operation.',404);
 }
 if(route==='/api/pro/jobs'||route.startsWith('/api/pro/jobs/')){
  const profile=access?.profile;if(!profile)return fail('Professional access required.',401);
  if(route==='/api/pro/jobs'&&req.method==='GET'){
   const own=jobs.filter(job=>selectedFor(job)?.profileId===profile.id||
    (access.active&&matchingIndustry(profile,job.industry)&&!(job.passes||[]).includes(profile.id)));
   return reply(200,{professional:{id:profile.id,name:profile.name},credits:creditsFor(profile.id),jobs:own.map(j=>{
    const ownBid=j.bids.find(b=>b.profileId===profile.id&&active(b,when));
    const selectedForMe=j.status==='selected'&&j.selectedBidId===ownBid?.id;
    return {...info(j,when),ownBid:ownBid?{id:ownBid.id,status:ownBid.status,amount:ownBid.amount,
     scope:ownBid.scope,decision:ownBid.decision||null,clarification:ownBid.clarification||null,paymentReference:ownBid.paymentReference||null,
     expiresAt:ownBid.expiresAt,fee:fee[j.industry],paymentLink:paymentLinks[j.industry]}:null,
     photos:selectedForMe&&j.sharePhotos===true?(j.photos||[]):[],invoice:selectedForMe?invoiceSummary(j):null,
     customerContact:selectedForMe?j.customer:null};
   })});
  }
  const selectedAction=route.match(/^\/api\/pro\/jobs\/([a-f0-9-]{36})\/(progress|invoice|answer)$/);
  if(selectedAction&&req.method==='POST'){
   const [,jobId,action]=selectedAction,job=jobs.find(j=>j.id===jobId);
   if(!job)return fail('Job not found.',404);
   const input=await body(req);
   if(action==='answer'){
    const bid=job.bids.find(b=>b.id===input.bidId&&b.profileId===profile.id&&b.status==='verified'&&!b.decision);
    if(!access.active||job.status!=='open'||!bid?.clarification||bid.clarification.answer)return fail('No pending question for this estimate.',404);
    const answer=clean(input.answer,500);
    if(answer.length<5||identifyingText(answer))return fail('Enter an answer without private contact details.');
    bid.clarification.answer=answer;
    bid.clarification.answeredAt=timestamp;
   }else{
    const bid=selectedFor(job);
    if(bid?.profileId!==profile.id)return fail('Job not found.',404);
    if(action==='progress'){
     const valid={selected:['scheduled','in_progress'],scheduled:['in_progress'],in_progress:['completed'],completed:[]};
     if(!valid[job.progress||'selected'].includes(input.progress))return fail('Choose the next available job status.',409);
     job.progress=input.progress;
    }else{
     if(invoiceFor(job))return reply(200,{invoice:invoiceSummary(job)});
     if(input.confirm!==true)return fail('Confirm invoice creation.');
     data.documents||=[];
     data.documents.push({
      id:crypto.randomUUID(),type:'invoice',number:'INV-'+job.id.slice(0,8).toUpperCase(),
      status:'unpaid',sourceJobId:job.id,sourceBidId:bid.id,profileId:profile.id,issuer:profile.name,
      client:job.customer.name,clientAddress:job.customer.address,clientPhone:job.customer.phone,
      clientEmail:job.customer.email,project:job.title,projectAddress:job.customer.address,
      scope:bid.scope,items:[{description:job.title,category:'Other',qty:1,rate:bid.amount,unit:'job'}],
      total:bid.amount,subtotal:bid.amount,tax:0,taxRate:0,payment:0,markup:0,discount:0,
      date:timestamp.slice(0,10),createdAt:timestamp,updatedAt:timestamp
     });
    }
   }
   job.updatedAt=timestamp;save(data);
   return reply(200,{ok:true,invoice:invoiceSummary(job)});
  }
  if(!access.active)return fail('An active membership is required for new marketplace work.',403);
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
   if(bid.paymentReference&&bid.paymentReference!==reference)return fail('Payment reference already submitted; contact the owner for correction.',409);
   if(jobs.some(job=>job.bids.some(other=>other!==bid&&other.paymentReference?.toUpperCase()===reference.toUpperCase()))||
      (data.paypalTransactions||[]).some(payment=>payment.id.toUpperCase()===reference.toUpperCase())){
    return fail('That payment reference is already associated with another payment.',409);
   }
   bid.paymentReference=reference;bid.expiresAt=expires(1440,when);bid.updatedAt=timestamp;save(data);
   return reply(200,{ok:true,message:'Payment reference recorded for manual owner verification. The estimate remains private until payment is verified.'});
  }
  if(job.status!=='open')return fail('This job is no longer open for estimates.',409);
  const credits=creditsFor(profile.id);
  if(!credits)return fail('Your estimate credits and billing eligibility must be verified by the owner first. This prevents double charges.',403);
  if((job.passes||[]).includes(profile.id))return fail('You passed on this job.',409);
  if(job.bids.some(b=>b.profileId===profile.id && active(b,when)))return fail('You already hold an estimate slot for this job.',409);
  if(validCount(job,when)>=job.bidLimit)return fail('The customer estimate limit has been reached. No extra bid was accepted.',409);
  const input=await body(req),amount=Number(input.amount),scope=clean(input.scope,1800);
  if(!Number.isFinite(amount)||amount<=0||amount>100000000||scope.length<15)return fail('Enter a positive estimate amount and at least 15 characters of scope.');
  if(input.feeAcknowledged!==true)return fail('Review and acknowledge the per-estimate fee first.');
  if(input.rulesAccepted!==true)return fail('Accept the Rules & Regulations and Terms of Use before submitting a private estimate.');
  const included=credits.remaining>0;
  const bid={id:crypto.randomUUID(),profileId:profile.id,amount:currency(amount),scope,
   status:included?'verified':'pending',creditUsed:included,creditPeriod:included?credits.period:null,
   professionalRulesVersion:rulesVersion,professionalRulesAcceptedAt:timestamp,
   verifiedAt:included?timestamp:null,fee:included?0:fee[job.industry],
   paymentReference:null,createdAt:timestamp,updatedAt:timestamp,expiresAt:included?null:expires(30,when)};
  job.bids.push(bid);job.updatedAt=timestamp;save(data);
  return reply(201,{ok:true,bidId:bid.id,fee:bid.fee,paymentLink:included?null:paymentLinks[job.industry],
   expiresAt:bid.expiresAt,creditApplied:included,
   message:included?'One included monthly estimate credit was used. Your private estimate is now available to the customer.':
   'Estimate slot reserved for 30 minutes. Pay the listed one-time fee and submit the receipt transaction ID. The estimate stays private until the owner verifies payment.'});
 }
 if(route==='/api/admin/jobs'||route.startsWith('/api/admin/jobs/')){
  if(!admin(req))return fail('Owner access required.',401);
  if(route==='/api/admin/jobs'&&req.method==='GET'){
   return reply(200,{entitlements,profiles:data.profiles.map(p=>({id:p.id,name:p.name,city:p.city})),jobs:jobs.map(job=>({
    ...info(job,when),customer:job.customer,photos:job.photos||[],invoice:invoiceSummary(job),selectedBidId:job.selectedBidId,
    bids:job.bids.map(b=>({...b,professional:data.profiles.find(p=>p.id===b.profileId)?.name||'Unknown'}))
   }))});
  }
  if(route==='/api/admin/jobs/entitlements'&&req.method==='POST'){
   const input=await body(req);
   const profile=data.profiles.find(p=>p.id===input.profileId),tier=clean(input.tier,10);
   if(!profile)return fail('Listed professional not found.',404);
   if(!['basic','pro','elite'].includes(tier))return fail('Choose Basic, Pro or Elite.');
   if(input.confirmedInPayPal!==true)return fail('The owner must independently verify this membership and billing period before granting credits.');
   data.jobEntitlements=entitlements.filter(e=>e.profileId!==profile.id||e.period!==billingMonth);
   data.jobEntitlements.push({profileId:profile.id,tier,period:billingMonth,verified:true,verifiedAt:timestamp});
   save(data);return reply(200,{ok:true,message:'Current-month '+tier+' entitlement verified for '+profile.name+'.'});
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
   data.paypalTransactions||=[];
   const reference=bid.paymentReference.toUpperCase();
   if(data.paypalTransactions.some(payment=>payment.id?.toUpperCase()===reference))return fail('This payment was already recorded.',409);
   let payment=null;
   if(paypal?.estimateReports){
    try{payment=await paypal.verifyEstimatePayment(bid.paymentReference,bid.fee,bid.createdAt)}
    catch{return fail('PayPal payment verification is temporarily unavailable.',503)}
    if(!payment)return fail('PayPal has not confirmed the matching estimate fee yet.',409);
   }
   data.paypalTransactions.push({
    id:bid.paymentReference,type:'estimate',mode:payment?paypal.mode:'live',jobId:job.id,bidId:bid.id,
    amount:(bid.fee??fee[job.industry]).toFixed(2),currency:'USD',at:payment?.at||timestamp,
    status:payment?'completed':'owner_verified',verification:payment?'paypal_reporting':'owner_confirmation'
   });
   bid.status='verified';bid.verifiedAt=timestamp;bid.updatedAt=timestamp;
  }else{bid.status='rejected';bid.updatedAt=timestamp;}
  job.updatedAt=timestamp;save(data);
  return reply(200,{ok:true,message:match[3]==='verify'?'Payment marked independently verified; estimate released privately to the customer.':'Estimate rejected; it will not be shown to the customer.'});
 }
 return fail('Not found.',404);
};
