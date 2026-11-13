'use strict';
const estimateRoutes = require('./estimate-routes');
const crmRoutes = require('./crm-routes');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const base=path.join(__dirname,'public'),dataFile=process.env.DATA_FILE||path.join(__dirname,'data','database.json'),port=Number(process.env.PORT||3000);
const ADMIN_TOKEN=process.env.ADMIN_TOKEN||'';
const {createPayPal,checkoutHash}=require('./paypal');
const payments=createPayPal();
const persistentStore=require('./persistent-store').createStore();
const oneDrive = require('./onedrive').createOneDrive({readSnapshot:()=>JSON.stringify(db()),stateStore:persistentStore.enabled?persistentStore.stateStore:null});
oneDrive.schedule(()=>console.error('Automatic OneDrive backup failed. Check the owner backup connection.'));
const seed={profiles:[{id:'superior',name:'Superior Maintenance and Remodeling',tagline:'From an idea to a finished improvement.',city:'Fontana',area:'Fontana, California — contact for service coverage',coverageMode:'cities',coverageAreas:[],coverageZip:'',coverageRadius:null,phone:'909-352-3627',website:'https://superior-maintenance-remodeling.indigotune5.chatgpt.site',logo:'/superior-logo.png',description:'Residential and commercial maintenance, painting and remodeling. Contact Superior to discuss the scope, estimate, and availability for your next project.',services:['Painting','Drywall & repairs','Flooring','Kitchens & bathrooms','Doors & windows','Patios & decks','General maintenance','Remodeling'],verified:false,featured:true,createdAt:'2026-11-01T00:00:00.000Z'}],reviews:[],intake:[],documents:[]};
function db(){const transaction=persistentStore.context.getStore();if(transaction)return structuredClone(transaction.value.records);try{const val=JSON.parse(fs.readFileSync(dataFile,'utf8'));return {...structuredClone(seed),...val}}catch(e){if(e.code==='ENOENT')return structuredClone(seed);throw new Error('Stored data could not be read. Contact the owner; existing records have not been replaced.')}}
function save(x){const transaction=persistentStore.context.getStore();if(transaction){transaction.value.records=x;transaction.dirty=true;return;}if(process.env.VERCEL)throw Error('Persistent request context required.');fs.mkdirSync(path.dirname(dataFile),{recursive:true});const tmp=dataFile+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(x,null,2),{mode:0o600});fs.renameSync(tmp,dataFile)}
if(!process.env.VERCEL&&!persistentStore.enabled&&!fs.existsSync(dataFile))save(seed);
function send(res,status,payload){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin'});res.end(JSON.stringify(payload))}
function body(req,max=16*1024){if(req.body!==undefined){try{const raw=Buffer.isBuffer(req.body)?req.body.toString():typeof req.body==='string'?req.body:JSON.stringify(req.body);if(Buffer.byteLength(raw)>max)return Promise.reject(Error('Request too large'));return Promise.resolve(JSON.parse(raw));}catch{return Promise.reject(Error('Invalid JSON'));}}return new Promise((resolve,reject)=>{let size=0,chunks=[];req.on('data',chunk=>{size+=chunk.length;if(size>max){reject(new Error('Request too large'));req.destroy()}else chunks.push(chunk)});req.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString()||'{}'))}catch{reject(new Error('Invalid JSON'))}});req.on('error',reject)})}
const visits=new Map();
function limited(req){let ip=(req.socket.remoteAddress||'unknown');let now=Date.now();let rec=visits.get(ip)||[];rec=rec.filter(t=>now-t<3600_000);const deny=rec.length>=8;rec.push(now);visits.set(ip,rec);return deny}
function admin(req){if(!ADMIN_TOKEN)return false;const token=req.headers['x-admin-token'];if(typeof token!=='string'||Buffer.byteLength(token)!==Buffer.byteLength(ADMIN_TOKEN))return false;return crypto.timingSafeEqual(Buffer.from(token),Buffer.from(ADMIN_TOKEN))}
function clean(v,max){return String(v??'').trim().replace(/[<>]/g,'').slice(0,max)}
function fail(res,e){send(res,e.message==='Request too large'?413:400,{error:e.message||'Invalid request'})}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.webmanifest':'application/manifest+json','.ico':'image/x-icon','.svg':'image/svg+xml'};
async function handle(req,res){
 try {
 const url=new URL(req.url,'http://localhost');const route=url.pathname;
 if(route==='/api/admin/export'&&req.method==='GET'){if(!admin(req))return send(res,401,{error:'Owner access required'});return send(res,200,db());}
 if(route==='/api/cron/backup'&&req.method==='GET'){
  const provided=req.headers.authorization||'',expected='Bearer '+(process.env.CRON_SECRET||'');
  if(!process.env.CRON_SECRET||provided.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(provided),Buffer.from(expected)))return send(res,401,{error:'Scheduled backup authorization required'});
  return send(res,200,await oneDrive.backup());
 }

 if(route==='/api/payments/config'&&req.method==='GET')return send(res,200,payments.config());
 if(route==='/api/paypal/webhook'&&req.method==='POST'){
  if(!payments.configured)return send(res,503,{error:'Payment verification is not configured.'});
  const event=await body(req,128*1024);
  let checked;try{checked=await payments.webhook(req.headers,event)}catch{return send(res,400,{error:'PayPal signature could not be verified.'})}
  const snapshot=db();
  if((snapshot.paypalEvents||[]).some(v=>v.id===checked.eventId))return send(res,200,{ok:true,duplicate:true});
  const original=snapshot.intake.find(v=>v.paypalSubscriptionId===checked.subscriptionId);
  const result=original?await payments.inspect(original,checked.subscriptionId):null;
  // Reload after external verification so concurrent local requests are retained.
  const d=db();d.paypalEvents=Array.isArray(d.paypalEvents)?d.paypalEvents:[];
  if(d.paypalEvents.some(v=>v.id===checked.eventId))return send(res,200,{ok:true,duplicate:true});
  const record=d.intake.find(v=>v.paypalSubscriptionId===checked.subscriptionId);
  if(record&&result){
   record.paymentVerification=result;record.paidPrivileges=result.verified;
   record.status=result.verified?'verified_payment':result.status==='CANCELLED'?'subscription_cancelled':'pending_payment_verification';
  }
  d.paypalEvents.push({id:checked.eventId,receivedAt:new Date().toISOString(),matched:Boolean(record)});
  save(d);return send(res,200,{ok:true});
 }
 if(['/api/paypal/checkout','/api/paypal/verify'].includes(route)&&req.method==='POST'){
  if(limited(req))return send(res,429,{error:'Too many requests. Try later.'});
  const input=await body(req),d=db(),record=d.intake.find(v=>v.id===input.requestId);
  if(!record||typeof input.checkoutToken!=='string'||!record.checkoutTokenHash||checkoutHash(input.checkoutToken)!==record.checkoutTokenHash)return send(res,401,{error:'Use the original application session to continue membership checkout.'});
  if(!payments.configured)return send(res,503,{error:'Payment verification is not configured. No charge has been made.'});
  if(route==='/api/paypal/checkout'){
   const checkout=await payments.create(record),latest=db(),current=latest.intake.find(v=>v.id===record.id);
   if(!current)return send(res,409,{error:'Application changed. Please try again.'});
   current.paypalSubscriptionId=checkout.subscriptionId;save(latest);return send(res,200,checkout);
  }
  if(input.subscriptionId!==record.paypalSubscriptionId)return send(res,400,{error:'Subscription does not match this application.'});
  const result=await payments.inspect(record,input.subscriptionId);
  const latest=db(),current=latest.intake.find(v=>v.id===record.id&&v.paypalSubscriptionId===input.subscriptionId);
  if(!current)return send(res,409,{error:'Application changed. Please try again.'});
  current.paymentVerification=result;current.paidPrivileges=result.verified;current.status=result.verified?'verified_payment':'pending_payment_verification';
  save(latest);return send(res,200,{verified:result.verified,message:result.verified?'Payment verified. Your business listing still requires owner review.':'Payment is not verified yet. No paid privileges have been activated.'});
 }
 if(route==='/api/auth/microsoft/callback'&&req.method==='GET'){
  try {await oneDrive.callback(url.searchParams.get('state'),url.searchParams.get('code'));
   res.writeHead(303,{'location':'/backups.html','cache-control':'no-store','referrer-policy':'no-referrer'});res.end();
  }catch{return send(res,400,{error:'Microsoft authorization failed or expired. Start a new connection from the owner backups page.'});}
  return;
 }
 if(route.startsWith('/api/admin/backups')){
  if(!admin(req))return send(res,401,{error:'Owner access required'});
  if(route==='/api/admin/backups/status'&&req.method==='GET')return send(res,200,oneDrive.status());
  if(route==='/api/admin/backups/connect'&&req.method==='POST')return send(res,200,{authorizationUrl:oneDrive.connect()});
  if(route==='/api/admin/backups'&&req.method==='POST')return send(res,201,await oneDrive.backup());
  if(route==='/api/admin/backups'&&req.method==='GET')return send(res,200,await oneDrive.list());
  if(route==='/api/admin/backups/recover'&&req.method==='POST'){
   const input=await body(req),snapshot=await oneDrive.recover(input.id);
   // Download only: never replace live records while the application is running.
   res.writeHead(200,{'content-type':'application/json','content-disposition':'attachment; filename="superior-proconnect-recovery.json"','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(snapshot);return;
  }
  return send(res,404,{error:'Not found'});
 }
 if(await crmRoutes(req,res,{db,save,send,body,admin,clean,limited}))return;
 if(await estimateRoutes(req,res,{db,save,send,body,admin,clean}))return;
 if(route==='/api/health'&&req.method==='GET')return send(res,200,{ok:true,persistence:persistentStore.enabled?'encrypted persistent ProConnect store':process.env.DATA_FILE?'configured data file':'local file (configure persistent storage before public launch)',payments:'PayPal plan details must be verified'});
 if(route==='/api/profiles'&&req.method==='GET')return send(res,200,{profiles:db().profiles});
 if(route==='/api/reviews'&&req.method==='GET'){const profile=clean(url.searchParams.get('profile')||'superior',80);const x=db().reviews.filter(r=>r.profileId===profile&&r.status==='approved').sort((a,b)=>b.createdAt.localeCompare(a.createdAt));return send(res,200,{reviews:x,total:x.length,average:x.length?Math.round(10*x.reduce((a,b)=>a+b.stars,0)/x.length)/10:null})}
 if(route==='/api/reviews'&&req.method==='POST'){
  if(limited(req))return send(res,429,{error:'Too many submissions. Try later.'});const x=await body(req);
  if(x.website)return send(res,200,{ok:true,moderation:true});const stars=Number(x.stars),name=clean(x.name,65),comment=clean(x.comment,800),profileId=clean(x.profileId,80);
  if(!Number.isInteger(stars)||stars<1||stars>5||name.length<2||comment.length<15||comment.length>800)return send(res,400,{error:'Enter your name, a rating and a review of at least 15 characters.'});
  const d=db();if(!d.profiles.some(p=>p.id===profileId))return send(res,404,{error:'Business not found'});
  const record={id:crypto.randomUUID(),profileId,name,comment,stars,status:'pending',ownerReply:null,createdAt:new Date().toISOString()};d.reviews.push(record);save(d);return send(res,201,{ok:true,moderation:true,message:'Review received. It will appear after moderation.'});
 }
 if(route==='/api/join'&&req.method==='POST'){
  if(limited(req))return send(res,429,{error:'Too many submissions. Try later.'});const x=await body(req);
  if(x.website)return send(res,200,{ok:true});const business=clean(x.business,100),email=clean(x.email,180),city=clean(x.city,80),phone=clean(x.phone,32);
  if(business.length<3||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||city.length<2)return send(res,400,{error:'Business name, valid email, and city are required.'});
  const industry=clean(x.industry||'construction',24),membership=clean(x.membership||'basic',12);
  if(!['construction','automotive'].includes(industry)||!['basic','pro'].includes(membership))return send(res,400,{error:'Select a valid industry and membership.'});
  const services=clean(x.services,300).split(/[,\n;]+/).map(v=>clean(v,50)).filter(Boolean).slice(0,15);
  if(!services.length)return send(res,400,{error:'List at least one service you provide.'});
  const coverageMode=clean(x.coverageMode||'cities',16), raw=clean(coverageMode==='states'?x.coverageStates:x.coverageAreas,400);
  if(!['cities','radius','states'].includes(coverageMode))return send(res,400,{error:'Choose a valid work-area type.'});
  const coverageAreas=raw.split(/[,\n;]+/).map(v=>clean(v,60)).filter(Boolean).slice(0,25);
  const coverageZip=clean(x.coverageZip,5), coverageRadius=Number(x.coverageRadius);
  if(coverageMode==='radius'&&(!/^[0-9]{5}$/.test(coverageZip)||![5,10,15,25,50,75,100,150].includes(coverageRadius)))return send(res,400,{error:'Enter a 5-digit starting ZIP code and choose a radius.'});
  if(coverageMode!=='radius'&&!coverageAreas.length)return send(res,400,{error:'List at least one city, county, ZIP code or state you serve.'});
  const serviceArea=coverageMode==='radius'?`${coverageRadius}-mile radius from ZIP ${coverageZip}`:coverageAreas.join(', ');
  const d=db(),checkoutToken=crypto.randomBytes(32).toString('hex');const record={id:crypto.randomUUID(),business,email,city,phone,industry,membership,services,coverageMode,coverageAreas:coverageMode==='radius'?[]:coverageAreas,coverageZip:coverageMode==='radius'?coverageZip:'',coverageRadius:coverageMode==='radius'?coverageRadius:null,serviceArea,paypalSubscriptionId:null,checkoutTokenHash:checkoutHash(checkoutToken),paidPrivileges:false,status:'interest',createdAt:new Date().toISOString()};d.intake.push(record);save(d);return send(res,201,{ok:true,requestId:record.id,checkoutToken,message:'Interest submitted. No payment has been taken.'});
 }
 if(route==='/api/subscription'&&req.method==='POST'){
  const x=await body(req);const requestId=clean(x.requestId,90),subscriptionId=clean(x.subscriptionId,100);
  if(!/^I-[A-Z0-9-]{6,}$/i.test(subscriptionId))return send(res,400,{error:'Invalid subscription ID'});
  const d=db(),rec=d.intake.find(e=>e.id===requestId);if(!rec)return send(res,404,{error:'Application not found'});
  return send(res,409,{error:'Continue through the original application checkout session. Browser subscription references do not verify payment.'});
 }
 if(route==='/api/admin/pending'&&req.method==='GET'){if(!admin(req))return send(res,401,{error:'Admin access required'});const d=db();return send(res,200,{reviews:d.reviews.filter(r=>r.status==='pending'),intake:d.intake,profiles:d.profiles})}
 if(route==='/api/admin/reviews'&&req.method==='GET'){if(!admin(req))return send(res,401,{error:'Admin access required'});return send(res,200,{reviews:db().reviews})}
 if(route==='/api/admin/review'&&req.method==='POST'){if(!admin(req))return send(res,401,{error:'Admin access required'});const x=await body(req);const d=db(),r=d.reviews.find(r=>r.id===x.id);if(!r)return send(res,404,{error:'Not found'});if(!['approved','rejected'].includes(x.status))return send(res,400,{error:'Invalid status'});r.status=x.status;save(d);return send(res,200,{ok:true})}
 if(route==='/api/admin/reply'&&req.method==='POST'){if(!admin(req))return send(res,401,{error:'Admin access required'});const x=await body(req);const d=db(),r=d.reviews.find(r=>r.id===x.id);if(!r)return send(res,404,{error:'Not found'});r.ownerReply=clean(x.reply,500)||null;save(d);return send(res,200,{ok:true})}
 if(route==='/api/admin/intake'&&req.method==='POST'){if(!admin(req))return send(res,401,{error:'Admin access required'});const x=await body(req);const d=db(),r=d.intake.find(r=>r.id===x.id);if(!r)return send(res,404,{error:'Not found'});if(!['interest','pending_payment_verification','verified','declined'].includes(x.status))return send(res,400,{error:'Invalid status'});r.status=x.status;save(d);return send(res,200,{ok:true})}
 if(route==='/api/admin/profile'&&req.method==='POST'){if(!admin(req))return send(res,401,{error:'Admin access required'});const x=await body(req);const d=db();const id=clean(x.id,80)||crypto.randomUUID();const p={id,industry:['construction','automotive'].includes(x.industry)?x.industry:(d.profiles.find(e=>e.id===id)?.industry||'construction'),name:clean(x.name,100),tagline:clean(x.tagline,150),city:clean(x.city,80),area:clean(x.area,400),coverageMode:clean(x.coverageMode,16),coverageZip:clean(x.coverageZip,5),coverageRadius:Number(x.coverageRadius)||null,coverageAreas:clean(x.coverageAreas,400).split(/[,\n;]+/).map(v=>clean(v,60)).filter(Boolean).slice(0,25),phone:clean(x.phone,40),website:clean(x.website,280),logo:'',description:clean(x.description,700),services:Array.isArray(x.services)?x.services.slice(0,15).map(v=>clean(v,40)):[],verified:false,featured:false,createdAt:new Date().toISOString()};if(!p.name||!p.city)return send(res,400,{error:'Name and city required'});const i=d.profiles.findIndex(e=>e.id===id);if(i<0)d.profiles.push(p);else {if(!x.logo)p.logo=d.profiles[i].logo;p.featured=d.profiles[i].featured;d.profiles[i]={...d.profiles[i],...p}}save(d);return send(res,200,{ok:true,profile:p})}

 if(route==='/api/admin/documents'&&req.method==='GET'){
  if(!admin(req))return send(res,401,{error:'Owner access required'});
  const records=(db().documents||[]).slice().sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  return send(res,200,{documents:records});
 }
 if(route==='/api/admin/documents'&&req.method==='POST'){
  if(!admin(req))return send(res,401,{error:'Owner access required'});
  const x=await body(req),type=clean(x.type,10);
  if(!['estimate','invoice'].includes(type))return send(res,400,{error:'Choose estimate or invoice.'});
  const client=clean(x.client,120);
  if(client.length<2)return send(res,400,{error:'Enter the customer name.'});
  const validNumber=(v,maximum)=>Number.isFinite(Number(v))&&Number(v)>=0&&Number(v)<=maximum;
  if(!Array.isArray(x.items)||!x.items.length||x.items.length>35)return send(res,400,{error:'Add 1–35 line items.'});
  const items=x.items.map(item=>({
   description:clean(item.description,250),category:['Labor','Materials','Other'].includes(item.category)?item.category:'Labor',
   qty:Number(item.qty),unit:clean(item.unit,25)||'ea',rate:Number(item.rate)
  }));
  if(items.some(item=>!item.description||!validNumber(item.qty,1e5)||!validNumber(item.rate,1e7)||item.qty<=0))
   return send(res,400,{error:'Every line needs a description, positive quantity, and valid rate.'});
  if(!validNumber(x.discount,1e8)||!validNumber(x.markup||0,1e8)||!validNumber(x.taxRate,100)||!validNumber(x.payment,1e8))
   return send(res,400,{error:'Check discount, tax and deposit/payment values.'});
  const subtotal=Math.round(items.reduce((sum,item)=>sum+item.qty*item.rate,0)*100)/100;
  const discount=Number(x.discount)||0,markup=Number(x.markup)||0,taxRate=Number(x.taxRate)||0,payment=Number(x.payment)||0;
  if(discount>subtotal+markup)return send(res,400,{error:'Discount cannot exceed subtotal plus markup.'});
  const tax=Math.round((subtotal+markup-discount)*taxRate)/100,total=Math.round((subtotal+markup-discount+tax)*100)/100;
  if(payment>total)return send(res,400,{error:'Deposit/payment cannot exceed total.'});
  const d=db();d.documents=Array.isArray(d.documents)?d.documents:[];
  const id=clean(x.id,80),index=id?d.documents.findIndex(doc=>doc.id===id):-1;
  if(id&&index<0)return send(res,404,{error:'Document not found.'});
  const prior=index>=0?d.documents[index]:null,now=new Date().toISOString();
  const count=d.documents.filter(doc=>doc.type===type).length+1;
  const defaultNo=(type==='estimate'?'EST':'INV')+'-'+new Date().getFullYear()+'-'+String(count).padStart(4,'0');
  const record={
   id:prior?.id||crypto.randomUUID(),type,number:clean(x.number,45)||prior?.number||defaultNo,
   status:['draft','sent','approved','paid','unpaid'].includes(x.status)?x.status:'draft',
   client,clientPhone:clean(x.clientPhone,60),clientEmail:clean(x.clientEmail,150),
   clientAddress:clean(x.clientAddress,250),project:clean(x.project,150),
   projectAddress:clean(x.projectAddress,250),date:clean(x.date,10),dueDate:clean(x.dueDate,10),
   scope:clean(x.scope,1800),items,markup,discount,taxRate,payment,subtotal,tax,total,sourceEstimateId:prior?.sourceEstimateId||null,
   notes:clean(x.notes,1500),terms:clean(x.terms,1000),
   license:clean(x.license,80),createdAt:prior?.createdAt||now,updatedAt:now
  };
  if(index>=0)d.documents[index]=record;else d.documents.push(record);
  save(d);return send(res,200,{ok:true,document:record});
 }


 // Owner-only estimates with a private customer-approval link.
 if(route==='/api/command/estimates'&&req.method==='GET'){
  if(!admin(req))return send(res,401,{error:'Owner access required'});
  return send(res,200,{documents:(db().documents||[]).slice().sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))});
 }
 if(route==='/api/command/estimates'&&req.method==='POST'){
  if(!admin(req))return send(res,401,{error:'Owner access required'});
  const x=await body(req),client=clean(x.client,120),id=clean(x.id,80);
  if(client.length<2)return send(res,400,{error:'Enter customer name.'});
  if(!Array.isArray(x.items)||x.items.length<1||x.items.length>35)return send(res,400,{error:'Provide 1–35 line items.'});
  const items=x.items.map(v=>({description:clean(v.description,250),category:['Labor','Materials','Other'].includes(v.category)?v.category:'Labor',unit:clean(v.unit,25)||'ea',qty:Number(v.qty),rate:Number(v.rate)}));
  if(items.some(v=>!v.description||!Number.isFinite(v.qty)||v.qty<=0||v.qty>1e5||!Number.isFinite(v.rate)||v.rate<0||v.rate>1e7))return send(res,400,{error:'Check item descriptions, quantities and rates.'});
  const markup=Number(x.markup)||0,discount=Number(x.discount)||0,taxRate=Number(x.taxRate)||0,deposit=Number(x.deposit)||0;
  if(![markup,discount,taxRate,deposit].every(Number.isFinite)||markup<0||markup>1e7||discount<0||taxRate<0||taxRate>100||deposit<0)return send(res,400,{error:'Check markup, discount, tax and deposit.'});
  const subtotal=Math.round(items.reduce((t,v)=>t+v.qty*v.rate,0)*100)/100;
  if(discount>subtotal+markup)return send(res,400,{error:'Discount cannot exceed subtotal plus markup.'});
  const tax=Math.round((subtotal+markup-discount)*taxRate)/100,total=Math.round((subtotal+markup-discount+tax)*100)/100;
  if(deposit>total)return send(res,400,{error:'Requested deposit cannot exceed estimate total.'});
  const d=db();d.documents=Array.isArray(d.documents)?d.documents:[];
  const index=id?d.documents.findIndex(r=>r.id===id):-1;
  if(id&&index<0)return send(res,404,{error:'Estimate not found.'});
  const prior=index>=0?d.documents[index]:null;
  if(prior&&prior.type!=='estimate')return send(res,400,{error:'Only estimates can be edited here.'});
  if(prior&&['approved','declined'].includes(prior.status))return send(res,409,{error:'An accepted or declined estimate cannot be changed. Create a new one.'});
  const now=new Date().toISOString(),count=d.documents.filter(v=>v.type==='estimate').length+1;
  const rec={id:prior?.id||crypto.randomUUID(),type:'estimate',number:clean(x.number,45)||prior?.number||'EST-'+new Date().getFullYear()+'-'+String(count).padStart(4,'0'),
   status:'ready',approvalToken:prior?.approvalToken||crypto.randomBytes(32).toString('hex'),
   client,clientPhone:clean(x.clientPhone,60),clientEmail:clean(x.clientEmail,150),clientAddress:clean(x.clientAddress,250),
   project:clean(x.project,150),projectAddress:clean(x.projectAddress,250),scope:clean(x.scope,1800),
   date:clean(x.date,10),dueDate:clean(x.dueDate,10),items,subtotal,markup,discount,taxRate,tax,total,
   deposit,payment:deposit,notes:clean(x.notes,1500),terms:clean(x.terms,1000),license:clean(x.license,80),
   createdAt:prior?.createdAt||now,updatedAt:now};
  if(index>=0)d.documents[index]=rec;else d.documents.push(rec);
  save(d);return send(res,200,{ok:true,document:rec});
 }
 if(route.startsWith('/api/command/estimates/')&&route.endsWith('/paid')&&req.method==='POST'){
  if(!admin(req))return send(res,401,{error:'Owner access required'});
  const id=route.slice('/api/command/estimates/'.length,-'/paid'.length);
  const d=db(),rec=(d.documents||[]).find(v=>v.id===id);
  if(!rec||rec.type!=='invoice')return send(res,404,{error:'Invoice not found.'});
  if(rec.status!=='unpaid')return send(res,409,{error:'Only unpaid invoices may be marked paid.'});
  rec.status='paid';rec.payment=rec.total;rec.updatedAt=new Date().toISOString();save(d);
  return send(res,200,{ok:true,document:rec});
 }
 // Unlisted tokenized customer estimate access, not indexable or owner-token accessible.
 if(route.startsWith('/api/public-estimates/')){
  const parts=route.split('/').filter(Boolean),share=parts[2]||'';
  if(!/^[a-f0-9]{64}$/.test(share))return send(res,404,{error:'Estimate not found.'});
  const d=db(),rec=(d.documents||[]).find(v=>v.type==='estimate'&&v.approvalToken===share);
  if(!rec)return send(res,404,{error:'Estimate not found.'});
  if(parts.length===3&&req.method==='GET'){
   const {id,type,number,client,clientAddress,project,projectAddress,scope,date,dueDate,items,subtotal,markup,discount,tax,total,deposit,notes,terms,status}=rec;
   return send(res,200,{document:{id,type,number,client,clientAddress,project,projectAddress,scope,date,dueDate,items,subtotal,markup,discount,tax,total,deposit,notes,terms,status}});
  }
  if(parts.length===4&&parts[3]==='decision'&&req.method==='POST'){
   if(limited(req))return send(res,429,{error:'Too many requests. Try later.'});
   if(rec.status!=='ready')return send(res,409,{error:'This estimate already has a decision.'});
   const x=await body(req),decision=clean(x.decision,10),signer=clean(x.signer,100);
   if(!['approved','declined'].includes(decision))return send(res,400,{error:'Invalid decision.'});
   if(decision==='approved'&&(signer.length<2||x.agreed!==true))return send(res,400,{error:'Full name and acceptance are required.'});
   rec.status=decision;rec.decisionSigner=signer;rec.decisionReason=clean(x.reason,700);rec.decidedAt=new Date().toISOString();rec.updatedAt=rec.decidedAt;
   if(decision==='approved'){
    const count=d.documents.filter(v=>v.type==='invoice').length+1,now=new Date(),due=new Date(now);due.setDate(due.getDate()+14);
    const invoice={...rec,id:crypto.randomUUID(),type:'invoice',
     number:'INV-'+now.getFullYear()+'-'+String(count).padStart(4,'0'),approvalToken:null,
     status:'unpaid',sourceEstimateId:rec.id,deposit:0,payment:0,
     date:now.toISOString().slice(0,10),dueDate:due.toISOString().slice(0,10),createdAt:rec.decidedAt,updatedAt:rec.decidedAt};
    d.documents.push(invoice);
   }
   save(d);return send(res,200,{ok:true,document:{status:rec.status,number:rec.number}});
  }
 }

 if(route.startsWith('/api/'))return send(res,404,{error:'Not found'});
 if(!['GET','HEAD'].includes(req.method))return send(res,405,{error:'Method not allowed'});
 const filepath=path.resolve(base,'.'+(route==='/'?'/index.html':route));if(!filepath.startsWith(base+path.sep))return send(res,403,{error:'Forbidden'});
 fs.stat(filepath,(err,stat)=>{if(err||!stat.isFile()){res.writeHead(404);res.end('Not found');return}res.writeHead(200,{'content-type':mime[path.extname(filepath)]||'application/octet-stream','x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin','x-frame-options':'SAMEORIGIN','cache-control':route==='/service-worker.js'?'no-cache':'public, max-age=120'});if(req.method==='HEAD')return res.end();fs.createReadStream(filepath).pipe(res)});
 }catch(e){fail(res,e)}
}
async function dispatch(req,res){if(req.url.startsWith('/api/')&&(process.env.VERCEL||persistentStore.enabled))return persistentStore.run(req,res,seed,handle);return handle(req,res);}
module.exports=dispatch;
if(require.main===module)http.createServer(dispatch).listen(port,'0.0.0.0',()=>console.log(`Handyman Services running on port ${port}`));
