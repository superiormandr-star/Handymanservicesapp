'use strict';
const crypto=require('node:crypto');
// Netlify Blobs holds only AES-GCM encrypted state, never customer plaintext.
// Atomic ETag conditions prevent concurrent writes overwriting paid memberships.
const storeName='superior-proconnect-records';
let runtimeGetStore;

function configureNetlifyStore(getStore){runtimeGetStore=getStore;}

function validateNamespace(namespace){
 if(typeof namespace!=='string'||!/^(?:production|preview-[a-z0-9_-]{1,60})$/.test(namespace)){
  throw Error('Invalid Netlify storage namespace');
 }
 return namespace;
}

function openNetlifyStore(getStore){
 const factory=getStore||runtimeGetStore;
 if(!factory)throw Error('Netlify Blobs runtime is unavailable.');
 return factory({name:storeName,consistency:'strong'});
}

function createNetlifyRPC({namespace='production',getStore}={}){
 const key=validateNamespace(namespace)+'/state.json.enc';
 const collision=()=>{const err=Error('Records changed during this request. Please retry.');err.status=409;return err;};
 async function read(store){
  const options={consistency:'strong',type:'text'};
  const result=await store.getWithMetadata(key,options);
  if(!result||result.data===null||result.data===undefined)return {revision:0,payload:null};
  if(typeof result.data!=='string')throw Error('Invalid encrypted storage state');
  if(result.etag)return {revision:result.etag,payload:result.data};

  // Netlify's local Blobs runtime supplies ETags on list and write, but
  // omits them on Get. Pair a fresh read with matching revisions around it.
  const revision=async()=>{
   const {blobs}=await store.list({prefix:key});
   return blobs.find(entry=>entry.key===key)?.etag;
  };
  const before=await revision();
  const fresh=await store.getWithMetadata(key,options);
  const after=await revision();
  if(!before||before!==after||typeof fresh?.data!=='string')throw collision();
  return {revision:after,payload:fresh.data};
 }
 return async function rpc(method,input){
  const store=openNetlifyStore(getStore);
  if(method==='GET')return read(store);
  if(method!=='PUT'||!input||typeof input.payload!=='string'||!input.payload)throw Error('Invalid storage update');
  if(typeof input.revision!=='string'||!input.revision)throw collision();
  const previous=await read(store);
  if(previous.revision!==input.revision)throw collision();
  // Save immutable ciphertext before attempting the compare-and-swap.
  const history=await store.set(namespace+'/history/'+crypto.randomUUID()+'.json.enc',previous.payload,{onlyIfNew:true});
  if(!history?.modified)throw Error('Encrypted history could not be preserved');
  const saved=await store.set(key,input.payload,{onlyIfMatch:input.revision});
  if(!saved?.modified||!saved.etag)throw collision();
  return {revision:saved.etag};
 };
}
module.exports={createNetlifyRPC,validateNamespace,openNetlifyStore,configureNetlifyStore};
