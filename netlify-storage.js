'use strict';
const crypto=require('node:crypto');
// Netlify Blobs holds only AES-GCM encrypted state, never customer plaintext.
// Atomic ETag conditions prevent concurrent writes overwriting paid memberships.
function createNetlifyRPC({namespace='production',getStore}={}){
 if(!/^(?:production|preview-[a-z0-9_-]{1,60})$/i.test(namespace))throw Error('Invalid Netlify storage namespace');
 const storeFactory=getStore||require('@netlify/blobs').getStore;
 const store=storeFactory({name:'superior-proconnect-records',consistency:'strong'});
 const key=namespace+'/state.json.enc';
 const collision=()=>{const err=Error('Records changed during this request. Please retry.');err.status=409;return err;};
 async function read(){
  const result=await store.getWithMetadata(key,{consistency:'strong',type:'text'});
  if(!result||result.data===null||result.data===undefined)return {revision:0,payload:null};
  if(!result.etag || typeof result.data!=='string')throw Error('Invalid encrypted storage state');
  return {revision:result.etag,payload:result.data};
 }
 return async function rpc(method,input){
  if(method==='GET')return read();
  if(method!=='PUT'||!input||typeof input.payload!=='string'||!input.payload)throw Error('Invalid storage update');
  if(typeof input.revision!=='string'||!input.revision)throw collision();
  const previous=await read();
  if(previous.revision!==input.revision)throw collision();
  // Save immutable ciphertext before attempting the compare-and-swap.
  const history=await store.set(namespace+'/history/'+crypto.randomUUID()+'.json.enc',previous.payload,{onlyIfNew:true});
  if(!history?.modified)throw Error('Encrypted history could not be preserved');
  const saved=await store.set(key,input.payload,{onlyIfMatch:input.revision});
  if(!saved?.modified||!saved.etag)throw collision();
  return {revision:saved.etag};
 };
}
module.exports={createNetlifyRPC};
