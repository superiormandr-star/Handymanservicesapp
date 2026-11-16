// Preserve the existing Node request/response API on Netlify Functions.
// Do not weaken owner authorization or persistent storage to make a preview pass.
import { Readable } from 'node:stream';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const dispatch=require('../../server.js');
const hopByHop=new Set(['connection','transfer-encoding','content-length','keep-alive']);
export default async function handler(request){
 const url=new URL(request.url);
 const bytes=Buffer.from(await request.arrayBuffer());
 const incoming=Readable.from(bytes.length?[bytes]:[]);
 incoming.method=request.method;
 incoming.url=url.pathname+url.search;
 incoming.headers=Object.fromEntries(request.headers);
 // The request IP is not used to authenticate anyone. Preserve request rate limits.
 incoming.socket={remoteAddress:request.headers.get('x-nf-client-connection-ip')||'0.0.0.0'};
 const headers=new Headers(),chunks=[];
 const outgoing={
   statusCode:200,
   setHeader(name,value){headers.set(name,String(value));return this;},
   getHeader(name){return headers.get(name);},
   writeHead(code,values={}){this.statusCode=code;for(const [k,v] of Object.entries(values))if(!hopByHop.has(k.toLowerCase()))headers.set(k,String(v));return this;},
   write(chunk){if(chunk!==undefined)chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));return true;},
   end(chunk){if(chunk!==undefined)chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));},
 };
 try{
  await dispatch(incoming,outgoing);
  for(const name of hopByHop)headers.delete(name);
  headers.set('cache-control','no-store');
  return new Response(Buffer.concat(chunks),{status:outgoing.statusCode,headers});
 }catch{
  return new Response(JSON.stringify({error:'The request could not be completed. No payment or record update was confirmed.'}),{
    status:503,headers:{'content-type':'application/json','cache-control':'no-store'}
  });
 }
}
export const config={path:'/api/*'};
