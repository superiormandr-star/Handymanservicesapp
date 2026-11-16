import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('Vercel entry exports a handler, authenticates documents, and never seeds temporary files',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'proconnect-vercel-')),file=join(dir,'must-not-exist.json');
 const proc=spawn(process.execPath,['-e',"const http=require('node:http');const handler=require('./api');http.createServer(handler).listen(0,'127.0.0.1',function(){console.log(this.address().port)})"],{cwd:new URL('../',import.meta.url),env:{...process.env,VERCEL:'1',VERCEL_ENV:'preview',DATA_FILE:file,ADMIN_TOKEN:'synthetic-owner',SPC_STORAGE_URL:'',SPC_STORAGE_PRIVATE_KEY:'',BLOB_READ_WRITE_TOKEN:'',BACKUP_ENCRYPTION_KEY:''}});
 try{
  const port=await new Promise((resolve,reject)=>{proc.stdout.once('data',c=>resolve(Number(c.toString().trim())));proc.once('error',reject);proc.once('exit',()=>reject(Error('Handler exited')));});
  const base='http://127.0.0.1:'+port;
  for(const route of ['/api/documents','/api/command/estimates','/api/admin/documents'])assert.equal((await fetch(base+route)).status,401);
  const health=await fetch(base+'/api/health');assert.equal(health.status,503);assert.match(health.headers.get('content-type'),/application\/json/);
  assert.equal((await fetch(base+'/api/documents',{headers:{'x-admin-token':'synthetic-owner'}})).status,503);
  assert.equal(existsSync(file),false);
 }finally{proc.kill();rmSync(dir,{recursive:true,force:true});}
});
