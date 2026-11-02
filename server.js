'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const base=path.join(__dirname,'public'),dataFile=process.env.DATA_FILE||path.join(__dirname,'data','database.json'),port=Number(process.env.PORT||3000);
const ADMIN_TOKEN=process.env.ADMIN_TOKEN||'';
const seed={profiles:[{id:'superior',name:'Superior Maintenance and Remodeling',tagline:'From an idea to a finished improvement.',city:'Fontana',area:'Fontana, California — contact for service coverage',coverageMode:'cities',coverageAreas:[],coverageZip:'',coverageRadius:null,phone:'909-352-3627',website:'https://superior-maintenance-remodeling.indigotune5.chatgpt.site',logo:'/superior-logo.png',description:'Residential and commercial maintenance, painting and remodeling. Contact Superior to discuss the scope, estimate, and availability for your next project.',services:['Painting','Drywall & repairs','Flooring','Kitchens & bathrooms','Doors & windows','Patios & decks','General maintenance','Remodeling'],verified:false,featured:true,createdAt:'2026-11-01T00:00:00.000Z'}],reviews:[],intake:[]};
function db(){try{const val=JSON.parse(fs.readFileSync(dataFile,'utf8'));return {...seed,...val}}catch{return structuredClone(seed)}}
function save(x){fs.mkdirSync(path.dirname(dataFile),{recursive:true});const tmp=dataFile+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(x,null,2),{mode:0o600});fs.renameSync(tmp,dataFile)}
if(!fs.existsSync(dataFile))save(seed);
function send(res,status,payload){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin'});res.end(JSON.stringify(payload))}
function body(req){return new Promise((resolve,reject)=>{let size=0,chunks=[];req.on('data',chunk=>{size+=chunk.length;if(size>16*1024){reject(new Error('Request too large'));req.destroy()}else chunks.push(chunk)});req.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString()||'{}'))}catch{reject(new Error('Invalid JSON'))}});req.on('error',reject)})}
const visits=new Map();
function limited(req){let ip=(req.socket.remoteAddress||'unknown');let now=Date.now();let rec=visits.get(ip)||[];rec=rec.filter(t=>now-t<3600_000);const deny=rec.length>=8;rec.push(now);visits.set(ip,rec);return deny}
function admin(req){if(!ADMIN_TOKEN)return false;const token=req.headers['x-admin-token'];if(typeof token!=='string'||Buffer.byteLength(token)!==Buffer.byteLength(ADMIN_TOKEN))return false;return crypto.timingSafeEqual(Buffer.from(token),Buffer.from(ADMIN_TOKEN))}
function clean(v,max){return String(v??'').trim().replace(/[<>]/g,'').slice(0,max)}
function fail(res,e){send(res,e.message==='Request too large'?413:400,{error:e.message||'Invalid request'})}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.webmanifest':'application/manifest+json','.ico':'image/x-icon','.svg':'image/svg+xml'};
http.createServer(async (req,res)=>{
 try {
 const url=new URL(req.url,'http://localhost');const route=url.pathname;
 if(route==='/api/health'&&req.method==='GET')return send(res,200,{ok:true,persistence:process.env.DATA_FILE?'configured data file':'local file (configure persistent storage before public launch)',payments:'PayPal plan details must be verified'});
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
  const services=clean(x.services,300).split(/[,\n;]+/).map(v=>clean(v,50)).filter(Boolean).slice(0,15);
  if(!services.length)return send(res,400,{error:'List at least one service you provide.'});
  const coverageMode=clean(x.coverageMode||'cities',16), raw=clean(coverageMode==='states'?x.coverageStates:x.coverageAreas,400);
  if(!['cities','radius','states'].includes(coverageMode))return send(res,400,{error:'Choose a valid work-area type.'});
  const coverageAreas=raw.split(/[,\n;]+/).map(v=>clean(v,60)).filter(Boolean).slice(0,25);
  const coverageZip=clean(x.coverageZip,5), coverageRadius=Number(x.coverageRadius);
  if(coverageMode==='radius'&&(!/^[0-9]{5}$/.test(coverageZip)||![5,10,15,25,50,75,100,150].includes(coverageRadius)))return send(res,400,{error:'Enter a 5-digit starting ZIP code and choose a radius.'});
  if(coverageMode!=='radius'&&!coverageAreas.length)return send(res,400,{error:'List at least one city, county, ZIP code or state you serve.'});
  const serviceArea=coverageMode==='radius'?`${coverageRadius}-mile radius from ZIP ${coverageZip}`:coverageAreas.join(', ');
  const d=db();const record={id:crypto.randomUUID(),business,email,city,phone,services,coverageMode,coverageAreas:coverageMode==='radius'?[]:coverageAreas,coverageZip:coverageMode==='radius'?coverageZip:'',coverageRadius:coverageMode==='radius'?coverageRadius:null,serviceArea,paypalSubscriptionId:null,status:'interest',createdAt:new Date().toISOString()};d.intake.push(record);save(d);return send(res,201,{ok:true,requestId:record.id,message:'Interest submitted. Complete PayPal checkout and await business listing verification.'});
 }
 if(route==='/api/subscription'&&req.method==='POST'){
  const x=await body(req);const requestId=clean(x.requestId,90),subscriptionId=clean(x.subscriptionId,100);
  if(!/^I-[A-Z0-9-]{6,}$/i.test(subscriptionId))return send(res,400,{error:'Invalid subscription ID'});
  const d=db(),rec=d.intake.find(e=>e.id===requestId);if(!rec)return send(res,404,{error:'Application not found'});
  rec.paypalSubscriptionId=subscriptionId;rec.status='pending_payment_verification';save(d);return send(res,200,{ok:true,message:'Subscription reference received. Listing will be activated after verification.'});
 }
 if(route==='/api/admin/pending'&&req.method==='GET'){if(!admin(req))return send(res,401,{error:'Admin access required'});const d=db();return send(res,200,{reviews:d.reviews.filter(r=>r.status==='pending'),intake:d.intake,profiles:d.profiles})}
 if(route==='/api/admin/reviews'&&req.method==='GET'){if(!admin(req))return send(res,401,{error:'Admin access required'});return send(res,200,{reviews:db().reviews})}
 if(route==='/api/admin/review'&&req.method==='POST'){if(!admin(req))return send(res,401,{error:'Admin access required'});const x=await body(req);const d=db(),r=d.reviews.find(r=>r.id===x.id);if(!r)return send(res,404,{error:'Not found'});if(!['approved','rejected'].includes(x.status))return send(res,400,{error:'Invalid status'});r.status=x.status;save(d);return send(res,200,{ok:true})}
 if(route==='/api/admin/reply'&&req.method==='POST'){if(!admin(req))return send(res,401,{error:'Admin access required'});const x=await body(req);const d=db(),r=d.reviews.find(r=>r.id===x.id);if(!r)return send(res,404,{error:'Not found'});r.ownerReply=clean(x.reply,500)||null;save(d);return send(res,200,{ok:true})}
 if(route==='/api/admin/intake'&&req.method==='POST'){if(!admin(req))return send(res,401,{error:'Admin access required'});const x=await body(req);const d=db(),r=d.intake.find(r=>r.id===x.id);if(!r)return send(res,404,{error:'Not found'});if(!['interest','pending_payment_verification','verified','declined'].includes(x.status))return send(res,400,{error:'Invalid status'});r.status=x.status;save(d);return send(res,200,{ok:true})}
 if(route==='/api/admin/profile'&&req.method==='POST'){if(!admin(req))return send(res,401,{error:'Admin access required'});const x=await body(req);const d=db();const id=clean(x.id,80)||crypto.randomUUID();const p={id,name:clean(x.name,100),tagline:clean(x.tagline,150),city:clean(x.city,80),area:clean(x.area,400),coverageMode:clean(x.coverageMode,16),coverageZip:clean(x.coverageZip,5),coverageRadius:Number(x.coverageRadius)||null,coverageAreas:clean(x.coverageAreas,400).split(/[,\n;]+/).map(v=>clean(v,60)).filter(Boolean).slice(0,25),phone:clean(x.phone,40),website:clean(x.website,280),logo:'',description:clean(x.description,700),services:Array.isArray(x.services)?x.services.slice(0,15).map(v=>clean(v,40)):[],verified:false,featured:false,createdAt:new Date().toISOString()};if(!p.name||!p.city)return send(res,400,{error:'Name and city required'});const i=d.profiles.findIndex(e=>e.id===id);if(i<0)d.profiles.push(p);else {if(!x.logo)p.logo=d.profiles[i].logo;p.featured=d.profiles[i].featured;d.profiles[i]={...d.profiles[i],...p}}save(d);return send(res,200,{ok:true,profile:p})}
 if(route.startsWith('/api/'))return send(res,404,{error:'Not found'});
 if(!['GET','HEAD'].includes(req.method))return send(res,405,{error:'Method not allowed'});
 const filepath=path.resolve(base,'.'+(route==='/'?'/index.html':route));if(!filepath.startsWith(base+path.sep))return send(res,403,{error:'Forbidden'});
 fs.stat(filepath,(err,stat)=>{if(err||!stat.isFile()){res.writeHead(404);res.end('Not found');return}res.writeHead(200,{'content-type':mime[path.extname(filepath)]||'application/octet-stream','x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin','x-frame-options':'SAMEORIGIN','cache-control':route==='/service-worker.js'?'no-cache':'public, max-age=120'});if(req.method==='HEAD')return res.end();fs.createReadStream(filepath).pipe(res)});
 }catch(e){fail(res,e)}
}).listen(port,'0.0.0.0',()=>console.log(`Handyman Services running on port ${port}`));
