import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
const catalog=JSON.parse(readFileSync(new URL('../public/subscription-plans.json',import.meta.url),'utf8'));
test('six separate packages cannot start checkout or activate from a forged callback',async()=>{
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const dir=mkdtempSync(join(tmpdir(),'superior-memberships-'));const file=join(dir,'db.json');
 const proc=spawn(process.execPath,['server.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:String(port),DATA_FILE:file,ADMIN_TOKEN:'test-membership-admin'}});
 const base=`http://127.0.0.1:${port}`;
 const post=async(path,data)=>{const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});return {status:r.status,body:await r.json()}};
 try{
  let ready=false;for(let n=0;n<60;n++){try{if((await fetch(base+'/api/health')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,100))}assert.ok(ready);
  assert.equal(catalog.plans.length,6);assert.equal(new Set(catalog.plans.map(p=>p.key)).size,6);
  for(const plan of catalog.plans){
   assert.equal(plan.checkoutEnabled,false);assert.equal(plan.checkoutUrl,null);assert.equal(plan.paypalPlanId,null);assert.equal(plan.interval,'MONTH');
   const response=await post('/api/membership-checkout',{industry:plan.industry,membership:plan.package,packageKey:plan.key});
   assert.equal(response.status,503);assert.equal(response.body.packageKey,plan.key);assert.equal(response.body.checkoutEnabled,false);assert.equal(response.body.checkoutUrl,undefined);
   const wrong=await post('/api/membership-checkout',{industry:plan.industry==='construction'?'automotive':'construction',membership:plan.package,packageKey:plan.key});assert.equal(wrong.status,400);
   const join=await post('/api/join',{business:'Package Test '+plan.key,email:'test@example.com',city:'Fontana',industry:plan.industry,membership:plan.package,services:'Service',coverageMode:'cities',coverageAreas:'Fontana'});assert.equal(join.status,201);
   const forged=await post('/api/subscription',{requestId:join.body.requestId,subscriptionId:'I-FORGED123456'});assert.equal(forged.status,409);
   const record=JSON.parse(readFileSync(file,'utf8')).intake.find(r=>r.id===join.body.requestId);assert.equal(record.industry,plan.industry);assert.equal(record.membership,plan.package);assert.equal(record.status,'interest');assert.equal(record.paypalSubscriptionId,null);
  }
  for(const entry of catalog.estimatePayments){assert.equal(entry.kind,'one-time-estimate');assert.ok(catalog.plans.every(p=>p.checkoutUrl!==entry.url));}
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  assert.ok(!app.includes('P-53U089831B5370605NLT23EQ'));assert.ok(!app.includes('paypal.com/sdk/js'));assert.ok(!html.includes('paypal-button-container'));
  for(const p of catalog.plans){assert.ok(html.includes(`data-package-key="${p.key}"`));assert.ok(html.includes(`id="${p.key}-status"`));}
 }finally{proc.kill('SIGTERM');rmSync(dir,{recursive:true,force:true})}
});
