import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn,execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const {chromium,devices}=createRequire(import.meta.url)(process.env.SPC_QA_PLAYWRIGHT || 'playwright-core');
const qaDir=mkdtempSync(join(tmpdir(),'proconnect-qa-'));
const cwd=process.cwd(),require=createRequire(cwd+'/server.js'),{Pool}=require('pg');
const url=process.env.SPC_QA_DATABASE_URL,recoveryUrl=process.env.SPC_QA_RECOVERY_URL;
if (!url||!recoveryUrl||url===recoveryUrl||[url,recoveryUrl].some(s=>!['localhost','127.0.0.1'].includes(new URL(s).hostname)))throw Error('Provide two distinct local QA databases.');
const backup=new URL(recoveryUrl);
const env={...process.env,NETLIFY_DB_URL:url,SPC_STORAGE_BACKEND:'netlify',SPC_ALLOW_INITIALIZE:'true',ADMIN_TOKEN:randomBytes(26).toString('hex'),BACKUP_ENCRYPTION_KEY:randomBytes(32).toString('hex'),SPC_WRITES_ENABLED:'true',SPC_PERSISTENCE_VERIFIED:'true',PORT:'31468'};
const base='http://127.0.0.1:'+env.PORT,owner={'x-admin-token':env.ADMIN_TOKEN};
const sql=readFileSync(cwd+'/netlify/database/migrations/202611190001_fresh_state.sql','utf8');
for(const connectionString of [url,backup.href]){const pool=new Pool({connectionString});const found=await pool.query("SELECT to_regclass('spc_state') AS existing");assert.equal(found.rows[0].existing,null,'Use a fresh QA database');await pool.query(sql);await pool.end();}
let proc,browser;
async function stop(){if(proc&&!proc.signalCode){const done=new Promise(ok=>proc.once('exit',ok));proc.kill();await done;}}
async function start(){proc=spawn(process.execPath,['-e',"import('./netlify/server/index.mjs').then(m=>m.default.listen(process.env.PORT,'127.0.0.1'))"],{cwd,env,stdio:['ignore','ignore','inherit']});
 for(let n=0;n<50;n++){try{const r=await fetch(base+'/api/health');assert.equal(r.status,200);return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('App readiness failed');}
async function api(path,body,headers={}){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...headers},body:body?JSON.stringify(body):undefined});const value=await r.json();if(r.status>=400)throw Error(path+' '+r.status+' '+value.error);return value;}
try{
await start();let empty=await api('/api/admin/export',null,owner);assert.deepEqual(empty.reviews,[]);assert.equal(empty.profiles.length,1);
assert.equal((await fetch(base+'/api/admin/export')).status,401);
const {key}=await api('/api/customer/account',{name:'QA Account'});const account={'x-customer-account':key};
const upload={name:'document.pdf',bytes:Buffer.from('%PDF-1.4 QA file').toString('base64')};
for(const industry of ['automotive','construction']){
 const j=await api('/api/jobs',{industry,name:'QA Customer',city:'Fontana',email:'qa@example.invalid',title:industry+' project',description:'Seeking an estimate for a scheduled service visit.',bidLimit:2,rulesAccepted:true,consent:true,attachments:[upload]},account);
 assert.equal((await api('/api/jobs/'+j.jobId,null,{'x-customer-key':j.customerKey})).attachments[0].bytes,upload.bytes);
}
const joined=await api('/api/join',{business:'QA shop',email:'qa@example.invalid',city:'Fontana',industry:'automotive',membership:'professional',services:'Brakes',coverageMode:'cities',coverageAreas:'Fontana'});
await api('/api/admin/intake',{id:joined.requestId,status:'approved'},owner);const access=await api('/api/admin/pro-access',{profileId:joined.requestId},owner);
const pro={'x-pro-token':access.token};assert.equal((await api('/api/crm/workspace',null,pro)).profile.industry,'automotive');assert.equal((await api('/api/pro/jobs',null,pro)).jobs.length,0);
await stop();env.SPC_ALLOW_INITIALIZE='false';await start();assert.equal((await api('/api/customer/account',null,account)).jobs.length,2);
console.log('PASS fresh PostgreSQL, customer account and uploads in both industries, private dashboard, owner access, restart persistence');
const saved=await api('/api/admin/export',null,owner),file=join(qaDir,'backup.enc');
execFileSync(process.execPath,['scripts/netlify-recovery.cjs','export',file],{cwd,env});
assert.ok(!readFileSync(file,'utf8').includes('QA Customer'));
await stop();env.NETLIFY_DB_URL=backup.href;execFileSync(process.execPath,['scripts/netlify-recovery.cjs','restore',file],{cwd,env});
await start();assert.deepEqual(await api('/api/admin/export',null,owner),saved);
console.log('PASS encrypted backup to fresh database, full recovered inventory matches');
browser=await chromium.launch({executablePath:process.env.SPC_QA_CHROME||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
for(const [label,opts] of [['desktop',{viewport:{width:1440,height:960}}],['Android',devices['Pixel 7']]]){
 const page=await browser.newPage(opts);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const [path,selector] of [['/','#home'],['/#construction','#construction'],['/#automotive','#automotive'],['/#customers','#customer-job-form'],['/pro.html','#signin'],['/command-center.html','main'],['/terms.html','body'],['/privacy.html','body'],['/standards.html','body']]){
  const r=await page.goto(base+path);if(r)assert.equal(r.status(),200,path);
  await page.locator(selector).waitFor({state:'visible',timeout:5000});
  const width=await page.evaluate(()=>[document.documentElement.scrollWidth,innerWidth]);assert.ok(width[0]<=width[1]+1,label+' '+path+' '+width.join('/'));
  if(['/','/#construction','/#automotive'].includes(path)){
   const selector=path==='/'?'img[src*="ProConnect_Master"]':path.endsWith('automotive')?'#automotive img.approved-logo':'#construction img.approved-logo';
   const logo=page.locator(selector).first();await logo.evaluate(i=>i.decode());assert.ok(await logo.evaluate(i=>i.naturalWidth>0));
  }
 }
 assert.deepEqual(errors,[]);console.log('PASS '+label+' homepage, both networks, logos, portals and legal routes with no overflow');await page.close();
}
}finally{await browser?.close();await stop();rmSync(qaDir,{recursive:true,force:true});}
