'use strict';
const crypto=require('node:crypto');
// Existing record envelope stays encrypted; Blob never contains customer plaintext.
function createBlobRPC({env=process.env,sdk=require('@vercel/blob'),namespace}){
 const pathname=env.SPC_BLOB_PATH||`superior-proconnect/${namespace}/state.json.enc`;
 if(!pathname.startsWith(`superior-proconnect/${namespace}/`)||pathname.includes('..')||pathname.includes('://'))throw Error('Invalid ProConnect Blob namespace');
 const options={access:'private',token:env.BLOB_READ_WRITE_TOKEN};
 const conflict=()=>{const error=Error('Records changed during this request. Please retry.');error.status=409;return error;};
 async function readSnapshot(){
  let before;
  try{before=await sdk.head(pathname,options);}
  catch(error){if(sdk.BlobNotFoundError&&error instanceof sdk.BlobNotFoundError)return {revision:0,payload:null};throw error;}
  const result=await sdk.get(pathname,{...options,useCache:false});
  if(!result||result.statusCode!==200)throw Error('Blob did not return current data');
  const payload=await new Response(result.stream).text();
  const after=await sdk.head(pathname,options);
  // The control-plane ETag is authoritative for conditional writes. Download
  // response ETags can describe a different HTTP representation after overwrite.
  if(!before.etag||before.etag!==after.etag)throw conflict();
  return {revision:after.etag,payload};
 }
 return async function rpc(method,input){
  try{
   if(method==='GET')return readSnapshot();
   // No runtime initialization, even when a caller supplies a revision of zero.
   if(typeof input.revision!=='string'||!input.revision)throw Error('Existing Blob ETag required');
   // Keep an immutable ciphertext snapshot before attempting a conditional update.
   const prior=await readSnapshot();
   if(prior.revision!==input.revision)throw conflict();
   const ciphertext=prior.payload;
   await sdk.put(`superior-proconnect/${namespace}/history/${crypto.randomUUID()}.json.enc`,ciphertext,{...options,addRandomSuffix:false,allowOverwrite:false,contentType:'application/octet-stream'});
   const result=await sdk.put(pathname,input.payload,{...options,addRandomSuffix:false,allowOverwrite:true,ifMatch:input.revision,contentType:'application/octet-stream'});
   return {revision:result.etag};
  }catch(error){
   if(error instanceof sdk.BlobPreconditionFailedError){const conflict=Error('Records changed during this request. Please retry.');conflict.status=409;throw conflict;}
   throw error;
  }
 };
}
module.exports={createBlobRPC};
