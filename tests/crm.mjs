import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
const cwd=new URL('../',import.meta.url);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
test('real inquiries, tenant isolation, estimate review, access revocation and backup restore',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'handyman-crm-')),file=join(dir,'live.json'),backup=join(dir,'backup.json'),restored=join(dir,'restored.json');
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const base='http://127.0.0.1:'+port,admin='crm-test-owner-private';let proc;
 async function start(dataFile=file){proc=spawn(process.execPath,['server.js'],{cwd,env:{...process.env,PORT:String(port),DATA_FILE:dataFile,ADMIN_TOKEN:admin,ESTIMATE_ASSISTANCE_ENABLED:'true'},stdio:'pipe'});for(let i=0;i<60;i++){try{if((await fetch(base+'/api/health')).ok)return}catch{}await pause(50)}throw Error('Server did not start')}
 async function stop(){if(proc.exitCode!==null||proc.signalCode!==null)return;await new Promise(r=>{proc.once('exit',r);proc.kill('SIGTERM')})}
 async function api(path,payload,headers={}){const r=await fetch(base+path,{method:payload?'POST':'GET',headers:{'content-type':'application/json',...headers},body:payload?JSON.stringify(payload):undefined});return {status:r.status,...await r.json()}}
 const owner={'x-admin-token':admin};
 const lead={profileId:'superior',name:'Real Customer',email:'customer@example.com',phone:'',location:'Fontana 92335',description:'Repair drywall in the living room and repaint the damaged wall.',consent:true};
 try{
  await start();
  assert.equal((await api('/api/admin/pro-access',{profileId:'superior'})).status,401);
  const access=await api('/api/admin/pro-access',{profileId:'superior'},owner);assert.equal(access.status,201);
  const pro={'x-pro-token':access.token};
  assert.equal((await api('/api/inquiries',{...lead,consent:false})).status,400);
  assert.equal((await api('/api/inquiries',lead)).status,201);
  let workspace=await api('/api/crm/workspace',null,pro);assert.equal(workspace.leads.length,1);const id=workspace.leads[0].id;
  assert.equal((await api('/api/profiles')).profiles.some(p=>p.email==='customer@example.com'),false);
  assert.equal((await api('/api/crm/workspace')).status,401);
  const stored=JSON.parse(readFileSync(file));assert.equal(stored.proAccess[0].tokenHash===access.token,false);assert.equal(readFileSync(file,'utf8').includes(access.token),false);
  await api('/api/admin/profile',{id:'other',name:'Other Contractor',city:'Los Angeles',services:['Painting']},owner);
  const other=await api('/api/admin/pro-access',{profileId:'other'},owner),otherHeaders={'x-pro-token':other.token};
  assert.equal((await api('/api/crm/workspace',null,otherHeaders)).leads.length,0);
  assert.equal((await api('/api/crm/leads/'+id,{status:'Paid'},otherHeaders)).status,404);
  assert.equal((await api('/api/crm/leads/'+id,{status:'Imaginary'},pro)).status,400);
  assert.equal((await api('/api/crm/leads/'+id,{status:'Contacted',note:'Customer prefers an afternoon visit.',reminderDate:'2026-12-15'},pro)).status,200);
  const request=await api('/api/crm/estimate-requests',{leadId:id,scope:'Prepare a drywall repair and repaint estimate with labor and materials separated.'},pro);assert.equal(request.status,201);
  assert.equal((await api('/api/crm/estimate-requests',{leadId:id,scope:'Another estimate for the same active request.'},pro)).status,409);
  assert.equal((await api('/api/admin/estimate-requests',{id:request.request.id,status:'Ready for Pro Review',items:[{description:'Drywall labor',qty:2,rate:85,category:'Labor'}],taxRate:5,deposit:50},owner)).status,200);
  assert.equal((await api('/api/crm/estimate-requests/'+request.request.id+'/decision',{decision:'approved'},otherHeaders)).status,404);
  assert.equal((await api('/api/crm/estimate-requests/'+request.request.id+'/decision',{decision:'changes',note:'Please add the paint materials.'},pro)).request.status,'In Preparation');
  await api('/api/admin/estimate-requests',{id:request.request.id,status:'Ready for Pro Review',items:[{description:'Drywall and paint',qty:1,rate:220}],deposit:50},owner);
  assert.equal((await api('/api/crm/estimate-requests/'+request.request.id+'/decision',{decision:'approved'},pro)).request.status,'Approved by Pro');
  assert.equal((await api('/api/admin/estimate-requests',{id:request.request.id,status:'In Preparation'},owner)).status,409);
  const replacement=await api('/api/admin/pro-access',{profileId:'superior'},owner);
  assert.equal((await api('/api/crm/workspace',null,pro)).status,401);
  const latest={'x-pro-token':replacement.token};
  await stop();await start();workspace=await api('/api/crm/workspace',null,latest);assert.equal(workspace.leads[0].status,'Contacted');assert.equal(workspace.leads[0].notes.length,1);assert.equal(workspace.requests[0].status,'Approved by Pro');
  await stop();
  function storage(command,target,dataFile=file){return spawnSync(process.execPath,['storage-tool.js',command,target],{cwd,env:{...process.env,DATA_FILE:dataFile},encoding:'utf8'})}
  assert.equal(storage('backup',backup).status,0);assert.equal(storage('restore',backup,restored).status,0);
  await start(restored);workspace=await api('/api/crm/workspace',null,latest);assert.equal(workspace.leads[0].id,id);assert.equal(workspace.requests[0].draft.total,220);await stop();
  writeFileSync(join(dir,'bad.json'),'{}');assert.equal(storage('restore',join(dir,'bad.json'),restored).status,1);assert.equal(JSON.parse(readFileSync(restored)).leads[0].id,id);
  writeFileSync(restored,'not json');await start(restored);assert.equal((await api('/api/profiles')).status,400);assert.equal(readFileSync(restored,'utf8'),'not json');await stop();
 }finally{if(proc?.exitCode===null)await stop();rmSync(dir,{recursive:true,force:true})}
});
