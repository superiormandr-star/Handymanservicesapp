'use strict';
const crypto=require('node:crypto');
const stages=['New','Contacted','Estimate Needed','Estimate Sent','Approved','Declined','Scheduled','Completed','Invoiced','Paid'];
const hash=token=>crypto.createHash('sha256').update(token).digest('hex');
module.exports=async function crmRoutes(req,res,u){
 const {db,save,send,body,admin,clean,limited}=u;
 const url=new URL(req.url,'http://localhost'),route=url.pathname;
 if(!route.startsWith('/api/crm/')&&route!=='/api/inquiries'&&route!=='/api/admin/pro-access'&&route!=='/api/admin/estimate-requests')return false;
 const reply=(status,data)=>{send(res,status,data);return true};
 const error=(message,status=400)=>reply(status,{error:message});
 const now=()=>new Date().toISOString();
 const email=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
 if(route==='/api/admin/estimate-requests'){
  if(!admin(req))return error('Owner access required',401);
  if(req.method==='GET')return reply(200,{requests:db().estimateRequests||[]});
  if(req.method!=='POST')return error('Method not allowed',405);
  const x=await body(req),d=db(),record=(d.estimateRequests||[]).find(r=>r.id===x.id);
  if(!record)return error('Estimate request not found',404);
  if(record.status==='Approved by Pro')return error('Approved drafts cannot be changed.',409);
  if(!['In Preparation','Ready for Pro Review'].includes(x.status))return error('Choose a valid draft status.');
  if(x.status==='Ready for Pro Review'){
   if(!Array.isArray(x.items)||!x.items.length||x.items.length>35)return error('Add 1–35 draft line items.');
   const items=x.items.map(i=>({description:clean(i.description,250),qty:Number(i.qty),rate:Number(i.rate),category:['Labor','Materials','Other'].includes(i.category)?i.category:'Labor'}));
   if(items.some(i=>!i.description||!Number.isFinite(i.qty)||i.qty<=0||i.qty>1e5||!Number.isFinite(i.rate)||i.rate<0||i.rate>1e7))return error('Check draft quantities, prices and descriptions.');
   const taxRate=Number(x.taxRate||0),deposit=Number(x.deposit||0);
   if(!Number.isFinite(taxRate)||taxRate<0||taxRate>100||!Number.isFinite(deposit)||deposit<0)return error('Check tax and deposit.');
   const subtotal=Math.round(items.reduce((s,i)=>s+i.qty*i.rate,0)*100)/100,tax=Math.round(subtotal*taxRate)/100,total=Math.round((subtotal+tax)*100)/100;
   if(deposit>total)return error('Deposit exceeds total.');
   record.draft={items,subtotal,taxRate,tax,total,deposit,scope:clean(x.scope||record.scope,3000),exclusions:clean(x.exclusions,1500),terms:clean(x.terms,1500)};
  }
  record.status=x.status;record.updatedAt=now();record.history.push({status:record.status,at:now()});save(d);
  return reply(200,{ok:true,request:record});
 }
 if(route==='/api/admin/pro-access'){
  if(!admin(req))return error('Owner access required',401);
  if(req.method!=='POST')return error('Method not allowed',405);
  const x=await body(req),d=db(),profile=d.profiles.find(p=>p.id===x.profileId);
  if(!profile)return error('Business not found',404);
  d.proAccess=Array.isArray(d.proAccess)?d.proAccess:[];
  const prior=d.proAccess.find(p=>p.profileId===profile.id);
  if(x.revoke===true){d.proAccess=d.proAccess.filter(p=>p.profileId!==profile.id);save(d);return reply(200,{ok:true})}
  const token=crypto.randomBytes(32).toString('hex');
  const access={profileId:profile.id,tokenHash:hash(token),createdAt:prior?.createdAt||now(),updatedAt:now()};
  d.proAccess=d.proAccess.filter(p=>p.profileId!==profile.id);d.proAccess.push(access);save(d);
  return reply(201,{token,profileId:profile.id,message:'Share privately with this business only. Previous access is revoked.'});
 }
 if(route==='/api/inquiries'){
  if(req.method!=='POST')return error('Method not allowed',405);
  if(limited(req))return error('Too many submissions. Try again later.',429);
  const x=await body(req);
  if(x.website)return reply(201,{ok:true,message:'Request received.'});
  const name=clean(x.name,100),contactEmail=clean(x.email,180),phone=clean(x.phone,40),description=clean(x.description,3000),location=clean(x.location,150);
  if(name.length<2||description.length<15||location.length<2||(!email(contactEmail)&&phone.replace(/\D/g,'').length<7)|| (contactEmail&&!email(contactEmail)))return error('Enter your name, project location, details (15 characters or more), and a valid email or phone number.');
  if(x.consent!==true)return error('Please allow the selected business to contact you about this project.');
  const d=db(),profile=d.profiles.find(p=>p.id===x.profileId);
  if(!profile)return error('Business not found',404);
  d.leads=Array.isArray(d.leads)?d.leads:[];
  const record={id:crypto.randomUUID(),profileId:profile.id,name,email:contactEmail,phone,location,description,status:'New',origin:'Directory quote request',consentAt:now(),createdAt:now(),updatedAt:now(),notes:[],reminderDate:'',history:[{status:'New',at:now()}]};
  d.leads.push(record);save(d);
  return reply(201,{ok:true,message:'Your request was saved for '+profile.name+'. They can review it in their private inbox. Availability and a response are not guaranteed.'});
 }
 const raw=req.headers['x-pro-token'];
 if(typeof raw!=='string'||!/^\w{64}$/.test(raw))return error('Professional access required',401);
 const digest=hash(raw),access=(db().proAccess||[]).find(a=>a.tokenHash===digest);
 if(!access)return error('Access expired or invalid. Ask the directory owner for a new access link.',401);
 const profileId=access.profileId;
 if(route==='/api/crm/workspace'&&req.method==='GET'){
  const d=db(),profile=d.profiles.find(p=>p.id===profileId);
  if(!profile)return error('Business not found',404);
  return reply(200,{profile,stages,leads:(d.leads||[]).filter(l=>l.profileId===profileId).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)),requests:(d.estimateRequests||[]).filter(r=>r.profileId===profileId),estimateAssistanceAvailable:process.env.ESTIMATE_ASSISTANCE_ENABLED==='true'});
 }
 const leadRoute=route.match(/^\/api\/crm\/leads\/([a-f0-9-]{36})$/);
 if(leadRoute&&req.method==='POST'){
  const x=await body(req),d=db(),lead=(d.leads||[]).find(l=>l.id===leadRoute[1]&&l.profileId===profileId);
  if(!lead)return error('Inquiry not found',404);
  if(x.status!==undefined&&!stages.includes(x.status))return error('Choose a valid job stage.');
  if(x.reminderDate!==undefined&&x.reminderDate!==''&&(!/^\d{4}-\d{2}-\d{2}$/.test(x.reminderDate)||Number.isNaN(Date.parse(x.reminderDate))))return error('Enter a valid reminder date.');
  const note=clean(x.note,1500);
  if(x.status&&lead.status!==x.status){lead.status=x.status;lead.history.push({status:x.status,at:now()})}
  if(x.reminderDate!==undefined)lead.reminderDate=x.reminderDate;
  if(note)lead.notes.push({id:crypto.randomUUID(),text:note,at:now()});
  lead.updatedAt=now();save(d);return reply(200,{ok:true,lead});
 }
 if(route==='/api/crm/estimate-requests'&&req.method==='POST'){
  if(process.env.ESTIMATE_ASSISTANCE_ENABLED!=='true')return error('Estimate assistance is upcoming. It is not currently available for purchase or fulfillment.',409);
  const x=await body(req),d=db(),lead=(d.leads||[]).find(l=>l.id===x.leadId&&l.profileId===profileId);
  if(!lead)return error('Inquiry not found',404);
  const scope=clean(x.scope,3000);if(scope.length<15)return error('Describe the estimate requirements in at least 15 characters.');
  d.estimateRequests=Array.isArray(d.estimateRequests)?d.estimateRequests:[];
  if(d.estimateRequests.some(r=>r.leadId===lead.id&&!['Approved by Pro','Declined by Pro'].includes(r.status)))return error('This job already has an estimate request in progress.',409);
  const record={id:crypto.randomUUID(),profileId,leadId:lead.id,scope,status:'Received',createdAt:now(),updatedAt:now(),draft:null,history:[{status:'Received',at:now()}]};
  d.estimateRequests.push(record);save(d);return reply(201,{ok:true,request:record});
 }
 const decision=route.match(/^\/api\/crm\/estimate-requests\/([a-f0-9-]{36})\/decision$/);
 if(decision&&req.method==='POST'){
  const x=await body(req),d=db(),record=(d.estimateRequests||[]).find(r=>r.id===decision[1]&&r.profileId===profileId);
  if(!record)return error('Estimate request not found',404);
  if(record.status!=='Ready for Pro Review')return error('This draft is not awaiting review.',409);
  if(!['approved','changes'].includes(x.decision))return error('Approve or request changes.');
  if(x.decision==='changes'&&clean(x.note,1500).length<5)return error('Describe the changes needed.');
  record.status=x.decision==='approved'?'Approved by Pro':'In Preparation';record.updatedAt=now();
  record.history.push({status:record.status,at:now(),note:clean(x.note,1500)});save(d);
  return reply(200,{ok:true,request:record,message:'Decision recorded. No message has been sent to your customer.'});
 }
 return error('Not found',404);
};
