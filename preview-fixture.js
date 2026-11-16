'use strict';
const crypto=require('node:crypto');
const {validateBackup}=require('./onedrive');
// Explicit QA bootstrap only. Production cannot execute this operation.
async function previewFixture(req,res,{env=process.env,sdk=require('@vercel/blob'),send}){
 if(env.VERCEL_ENV!=='preview'||env.SPC_PREVIEW_FIXTURE_ENABLED!=='true')return send(res,404,{error:'Not found'});
 if(req.method!=='POST')return send(res,405,{error:'Method not allowed'});
 const namespace=env.SPC_STORAGE_NAMESPACE;
 if(!/^preview-[a-zA-Z0-9_-]{1,60}$/.test(namespace||'')||env.SPC_STORAGE_BACKEND!=='blob')return send(res,503,{error:'An isolated preview Blob namespace is required.'});
 if(!/^[a-f0-9]{64}$/i.test(env.BACKUP_ENCRYPTION_KEY||''))return send(res,503,{error:'Configure an isolated preview encryption key.'});
 const pathname=`superior-proconnect/${namespace}/state.json.enc`;
 // A custom primary path is never accepted by this test-only initializer.
 if(env.SPC_BLOB_PATH&&env.SPC_BLOB_PATH!==pathname)return send(res,503,{error:'Custom storage paths are not accepted for preview initialization.'});
 const records={profiles:[{id:'synthetic-qa',name:'Synthetic ProConnect QA Business',city:'Test City',services:['Synthetic repairs'],verified:false,featured:false}],reviews:[],intake:[],documents:[{id:'synthetic-persistence-baseline',type:'estimate',number:'SYNTHETIC-BASELINE',status:'draft',client:'Synthetic QA Customer',project:'Persistence verification only',items:[{description:'Synthetic line',qty:1,rate:1}],subtotal:1,tax:0,total:1,payment:0,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}]};
 validateBackup(JSON.stringify(records));
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',Buffer.from(env.BACKUP_ENCRYPTION_KEY,'hex'),iv),bytes=Buffer.concat([cipher.update(JSON.stringify({records,oauth:{}})),cipher.final()]);
 const envelope=JSON.stringify({v:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:bytes.toString('base64')});
 try{await sdk.put(pathname,envelope,{access:'private',token:env.BLOB_READ_WRITE_TOKEN,addRandomSuffix:false,allowOverwrite:false,contentType:'application/octet-stream'});}
 catch{return send(res,409,{error:'Preview fixture was not created. Existing objects are never overwritten.'});}
 return send(res,201,{ok:true,namespace,synthetic:true});
}
module.exports={previewFixture};
