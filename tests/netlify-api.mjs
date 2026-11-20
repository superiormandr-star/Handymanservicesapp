import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('Netlify API preserves owner authentication, fails closed and never creates a local database',()=>{
 const dir=mkdtempSync(join(tmpdir(),'spc-netlify-')),file=join(dir,'must-not-exist.json');
 try{
  const result=spawnSync(process.execPath,['--input-type=module','-e',`
   import assert from 'node:assert/strict';
   const {default:handler}=await import('./netlify/functions/api.mjs');
   for(const path of ['/api/documents','/api/admin/pending','/api/command/estimates']){
    const response=await handler(new Request('https://preview.example'+path));
    assert.equal(response.status,401);assert.equal(response.headers.get('cache-control'),'no-store');
   }
   const health=await handler(new Request('https://preview.example/api/health'));
   assert.equal(health.status,503);assert.match(health.headers.get('content-type'),/application\\/json/);
   const owner=await handler(new Request('https://preview.example/api/documents',{headers:{'x-admin-token':'synthetic-owner'}}));
   assert.equal(owner.status,503);
  `],{cwd:new URL('../',import.meta.url),env:{...process.env,NETLIFY:'true',CONTEXT:'deploy-preview',VERCEL:'',DATA_FILE:file,ADMIN_TOKEN:'synthetic-owner',SPC_STORAGE_BACKEND:'netlify',SPC_MIGRATION_VERIFIED:'false',BACKUP_ENCRYPTION_KEY:''},encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);assert.equal(existsSync(file),false);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
