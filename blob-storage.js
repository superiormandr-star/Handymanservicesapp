'use strict';
const crypto=require('node:crypto');
// Existing record envelope stays encrypted; Blob never contains customer plaintext.
function createBlobRPC({env=process.env,sdk=require('@vercel/blob'),namespace}){
 const pathname=env.SPC_BLOB_PATH||`superior-proconnect/${namespace}/state.json.enc`;
 if(!pathname.startsWith(`superior-proconnect/${namespace}/`)||pathname.includes('..')||pathname.includes('://'))throw Error('Invalid ProConnect Blob namespace');
 const options={access:'private',token:env.BLOB_READ_WRITE_TOKEN};
 return async function rpc(method,input){
  try{
   if(method==='GET'){
    const result=await sdk.get(pathname,{...options,useCache:false});
    if(!result)return {revision:0,payload:null};
    if(result.statusCode!==200||!result.blob.etag)throw Error('Blob did not return current data and ETag');
    return {revision:result.blob.etag,payload:await new Response(result.stream).text()};
   }
   // No runtime initialization, even when a caller supplies a revision of zero.
   if(typeof input.revision!=='string'||!input.revision)throw Error('Existing Blob ETag required');
   // Keep an immutable ciphertext snapshot before attempting a conditional update.
   const prior=await sdk.get(pathname,{...options,useCache:false});
   if(!prior||prior.blob.etag!==input.revision){const error=Error('Concurrent update');error.status=409;throw error;}
   const ciphertext=await new Response(prior.stream).text();
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
