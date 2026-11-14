import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
test('customer approval creates one invoice, rejects replay, and owner records payment',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'proconnect-docs-')),socket=createServer();
 await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const proc=spawn(process.execPath,['server.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:String(port),DATA_FILE:join(dir,'db.json'),ADMIN_TOKEN:'documents-test-token'}});
 const base='http://127.0.0.1:'+port;
 async function api(path,payload,owner=false){const r=await fetch(base+path,{method:payload?'POST':'GET',headers:{'content-type':'application/json',...(owner?{'x-admin-token':'documents-test-token'}:{})},body:payload?JSON.stringify(payload):undefined});return {status:r.status,body:await r.json()}}
 try{
  let ready=false;for(let i=0;i<100;i++){try{if((await api('/api/health')).status===200){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,50))}assert.ok(ready);
  assert.equal((await api('/api/admin/backups/status')).status,401);
  assert.equal((await api('/api/admin/backups/status',null,true)).status,200);
  const input={client:'Actual Test Customer',items:[{description:'Repair labor',qty:2,rate:100}],taxRate:10,deposit:50};
  assert.equal((await api('/api/command/estimates',input)).status,401);
  const estimate=await api('/api/command/estimates',input,true);assert.equal(estimate.status,200);assert.equal(estimate.body.document.total,220);
  const approval='/api/public-estimates/'+estimate.body.document.approvalToken;
  assert.equal((await api(approval)).body.document.approvalToken,undefined);
  assert.equal((await api(approval+'/decision',{decision:'approved',signer:'Test Customer',agreed:false})).status,400);
  assert.equal((await api(approval+'/decision',{decision:'approved',signer:'Test Customer',agreed:true})).status,200);
  assert.equal((await api(approval+'/decision',{decision:'approved',signer:'Test Customer',agreed:true})).status,409);
  const documents=(await api('/api/command/estimates',null,true)).body.documents;
  const invoices=documents.filter(v=>v.type==='invoice');assert.equal(invoices.length,1);assert.equal(invoices[0].total,220);
  const paid=await api('/api/command/estimates/'+invoices[0].id+'/paid',{},true);assert.equal(paid.body.invoice.payment,220);assert.equal(paid.body.invoice.status,'paid');
 }finally{await new Promise(r=>{proc.once('exit',r);proc.kill()});rmSync(dir,{recursive:true,force:true})}
});
