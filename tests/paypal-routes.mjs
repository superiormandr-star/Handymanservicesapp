import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
test('checkout, payment verification, signed webhook replay and cancellation through actual API routes',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'proconnect-paypal-')),state=join(dir,'fixture.json'),file=join(dir,'records.json');writeFileSync(state,'{}');
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const proc=spawn(process.execPath,['--require','./tests/fixtures/paypal-preload.cjs','server.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:String(port),DATA_FILE:file,ADMIN_TOKEN:'test-only-owner',PAYPAL_FIXTURE_FILE:state,PAYPAL_CLIENT_ID:'fake-client',PAYPAL_CLIENT_SECRET:'fake-secret',PAYPAL_WEBHOOK_ID:'fake-hook',PAYPAL_ENVIRONMENT:'sandbox',PAYPAL_CHECKOUT_ENABLED:'true',APP_ORIGIN:'https://example.com',PAYPAL_PLANS_JSON:JSON.stringify({'construction:basic':{id:'P-EXAMPLE123',amount:'25.00',currency:'USD'}})}});
 const base='http://127.0.0.1:'+port;
 async function api(path,payload,headers={}){const r=await fetch(base+path,{method:payload?'POST':'GET',headers:{'content-type':'application/json',...headers},body:payload?JSON.stringify(payload):undefined});return {status:r.status,body:await r.json()};}
 try{
  let ready=false;for(let i=0;i<100;i++){try{if((await api('/api/health')).status===200){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,50))}assert.ok(ready);
  const application=await api('/api/join',{business:'Payment Test Shop',email:'test@example.com',city:'Test City',services:'Repairs',coverageMode:'cities',coverageAreas:'Test City',industry:'construction',membership:'basic'});assert.equal(application.status,201);
  const session={requestId:application.body.requestId,checkoutToken:application.body.checkoutToken};writeFileSync(state,JSON.stringify({application:session.requestId,status:'ACTIVE'}));
  assert.equal((await api('/api/paypal/checkout',{...session,checkoutToken:'forged'})).status,401);
  const checkout=await api('/api/paypal/checkout',session);assert.equal(checkout.status,200);
  const verified=await api('/api/paypal/verify',{...session,subscriptionId:checkout.body.subscriptionId});assert.equal(verified.body.verified,true);
  const signature=Object.fromEntries(['paypal-auth-algo','paypal-cert-url','paypal-transmission-id','paypal-transmission-time'].map(k=>[k,'test']));signature['paypal-transmission-sig']='valid';
  const event={id:'WH-PAID',resource:{id:checkout.body.subscriptionId}};
  assert.equal((await api('/api/paypal/webhook',event,{...signature,'paypal-transmission-sig':'forged'})).status,400);
  assert.equal((await api('/api/paypal/webhook',event,signature)).status,200);
  assert.equal((await api('/api/paypal/webhook',event,signature)).body.duplicate,true);
  let records=JSON.parse(readFileSync(file));assert.equal(records.paypalEvents.length,1);assert.equal(records.intake[0].paidPrivileges,true);assert.equal(records.profiles.length,1,'payment alone must not publish a listing');
  writeFileSync(state,JSON.stringify({application:session.requestId,status:'CANCELLED'}));assert.equal((await api('/api/paypal/webhook',{id:'WH-CANCELED',resource:{id:checkout.body.subscriptionId}},signature)).status,200);
  records=JSON.parse(readFileSync(file));assert.equal(records.intake[0].paidPrivileges,false);assert.equal(records.intake[0].status,'subscription_cancelled');assert.equal(JSON.stringify(records).includes(session.checkoutToken),false);
 }finally{await new Promise(r=>{proc.once('exit',r);proc.kill()});rmSync(dir,{recursive:true,force:true})}
});
