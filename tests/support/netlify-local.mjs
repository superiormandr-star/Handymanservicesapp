// HTTP bridge for testing the actual Netlify v2 Fetch handler with Netlify's
// local Blobs implementation. No cloud credentials or real provider are used.
import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import dispatch from '../../server.js';
import handleNetlify from '../../netlify/functions/api.mjs';

const server=createServer(async (request,response)=>{
 const url = new URL(request.url,'http://127.0.0.1');
 if(!url.pathname.startsWith('/api/'))return dispatch(request,response);
 try{
  const hasBody=!['GET','HEAD'].includes(request.method);
  const input=new Request(url,{method:request.method,headers:request.headers,
   ...(hasBody&&{body:Readable.toWeb(request),duplex:'half'})});
  const output=await handleNetlify(input,{ip:request.socket.remoteAddress});
  response.writeHead(output.status,Object.fromEntries(output.headers));
  response.end(Buffer.from(await output.arrayBuffer()));
 }catch{
  response.writeHead(500);response.end();
 }
});
server.listen(Number(process.env.PORT||0),'127.0.0.1',()=>console.log(server.address().port));
