import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createInterface} from 'node:readline';
import {createRequire} from 'node:module';
import {BlobsServer} from '@netlify/blobs/server';
import {getStore,setEnvironmentContext} from '@netlify/blobs';

const require=createRequire(import.meta.url);
const {openNetlifyStore}=require('../../netlify-storage');
const {netlifyRecords}=require('../../netlify-records');

export const testKey='cd'.repeat(32);
export const ownerToken='synthetic-netlify-test-owner';
export const namespace='preview-netlify-integration';

export async function createEmulator() {
 const dir=await mkdtemp(join(tmpdir(),'proconnect-netlify-sdk-'));
 const blobToken='synthetic-blob-token';
 const server=new BlobsServer({directory:dir,token:blobToken});
 const {port}=await server.start();
 const context={siteID:'local-netlify-test',token:blobToken,apiURL:'http://127.0.0.1:'+port};
 setEnvironmentContext(context);
 const store=openNetlifyStore(getStore);
 const env={
  ...process.env,PORT:'0',NETLIFY:'true',VERCEL:'',CONTEXT:'deploy-preview',
  SPC_STORAGE_BACKEND:'netlify',SPC_STORAGE_NAMESPACE:namespace,SPC_NETLIFY_DATA_READY:'true',
  SPC_PERSISTENCE_VERIFIED:'true',SPC_WRITES_ENABLED:'true',BACKUP_ENCRYPTION_KEY:testKey,
  NETLIFY_BLOBS_CONTEXT:Buffer.from(JSON.stringify(context)).toString('base64'),
  ADMIN_TOKEN:ownerToken,PAYPAL_BILLING_ENABLED:'false'
 };
 let processHandle;
 return {
  store,
  records: name=>netlifyRecords(store,name||namespace,testKey),
  async start(selectedNamespace=namespace){
   if(processHandle)throw Error('Stop the current app first.');
   processHandle=spawn(process.execPath,[new URL('./netlify-local.mjs',import.meta.url).pathname],{
    env:{...env,SPC_STORAGE_NAMESPACE:selectedNamespace},stdio:['ignore','pipe','inherit']
   });
   const reader=createInterface({input:processHandle.stdout});
   const address=await Promise.race([
    once(reader,'line').then(([line])=>line),
    once(processHandle,'exit').then(([code])=>{throw Error('Local Functions exited: '+code)})
   ]);
   reader.close();
   return 'http://127.0.0.1:'+Number(address);
  },
  async stop() {
   if(!processHandle)return;
   const child=processHandle;processHandle=undefined;
   if(child.exitCode!==null)return;
   const exited=once(child,'exit');
   child.kill();
   await exited;
  },
  async close(){
   await this.stop();
   await server.stop();
   await rm(dir,{recursive:true,force:true});
  }
 };
}
