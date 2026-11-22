import test from 'node:test';import assert from 'node:assert/strict';import {opportunityApi,priority} from '../cloudflare/opportunity.mjs';
const url='https://example.com/api/opportunity/prospects',key='x'.repeat(40),headers={authorization:'Bearer '+key};
test('priority based on verified signals',()=>{assert.equal(priority({}),0);assert.equal(priority({inbound:true,bookingGap:true,highValue:true}),100);assert.equal(priority({inbound:'true'}),0)});
test('fails closed without secret or valid token',async()=>{for(const env of [{},{OPPORTUNITY_OWNER_TOKEN:key}])assert.equal((await opportunityApi(new Request(url),env)).status,401)});
test('unrelated route is not handled',async()=>assert.equal(await opportunityApi(new Request('https://example.com/api/jobs'),{}),null));
test('owner read returns only requested fields',async()=>{const db={prepare:sql=>({all:async()=>({results:[{id:'1',business:'Example'}]})})};const response=await opportunityApi(new Request(url,{headers}),{OPPORTUNITY_OWNER_TOKEN:key,DB:db});assert.equal(response.status,200);assert.equal((await response.json()).prospects[0].business,'Example');assert.match(response.headers.get('cache-control'),/no-store/)});
test('cross origin denied',async()=>assert.equal((await opportunityApi(new Request(url,{headers:{...headers,origin:'https://other.example'}}),{OPPORTUNITY_OWNER_TOKEN:key,DB:{}})).status,403));
test('invalid prospect denied',async()=>assert.equal((await opportunityApi(new Request(url,{method:'POST',headers,body:'{}'}),{OPPORTUNITY_OWNER_TOKEN:key,DB:{}})).status,400));
test('valid prospect persists bound values',async()=>{let bound;const DB={prepare:()=>({bind:(...v)=>{bound=v;return{run:async()=>({})}}})};const response=await opportunityApi(new Request(url,{method:'POST',headers,body:JSON.stringify({business:'Example',city:'Ontario',industry:'construction',source:'Public website',bookingGap:true})}),{DB,OPPORTUNITY_OWNER_TOKEN:key});assert.equal(response.status,201);assert.equal(bound[1],'Example');assert.equal(bound[7],35)});
test('demo booking requires a date',async()=>assert.equal((await opportunityApi(new Request(url+'/12345678-1234-1234-1234-123456789012',{method:'PATCH',headers,body:JSON.stringify({status:'demo_booked'})}),{OPPORTUNITY_OWNER_TOKEN:key,DB:{}})).status,400));

test('owner overview requires authorization',async()=>assert.equal((await opportunityApi(new Request('https://example.com/api/opportunity/overview'),{OPPORTUNITY_OWNER_TOKEN:key})).status,401));
test('overview reports unavailable sources separately and never selects private fields',async()=>{const DB={prepare:sql=>{assert.doesNotMatch(sql,/customer_private|access_hash|SELECT \*/);return{all:async()=>{if(sql.includes('payment_events'))throw Error('missing table');return {results:[]}}}}};const response=await opportunityApi(new Request('https://example.com/api/opportunity/overview',{headers}),{DB,OPPORTUNITY_OWNER_TOKEN:key});assert.equal(response.status,200);const body=await response.json();assert.equal(body.sections.jobs.available,true);assert.equal(body.sections.payments.available,false);assert.equal(body.limitations.paymentTotalsComplete,false)});

function sessionTestDb(){const sessions=new Map();return{sessions,prepare(sql){return{bind(...args){return{run:async()=>{if(sql.startsWith('INSERT INTO spc2_owner_sessions'))sessions.set(args[0],{owner_generation:args[1],expires_at:args[2]});else if(sql.includes('WHERE session_hash='))sessions.delete(args[0]);return {meta:{changes:1}}},first:async()=>sessions.get(args[0])}},all:async()=>({results:[]})}}}}
test('remembered login, rotation, CSRF, logout and expiry',async()=>{
 const db=sessionTestDb(),env={DB:db,OPPORTUNITY_OWNER_TOKEN:key},base='https://example.com/api/opportunity/',same={origin:'https://example.com','x-spc2-session':'1'};
 const post=(path,h)=>new Request(base+path,{method:'POST',headers:{...same,...h}});
 assert.equal((await opportunityApi(post('session/login',{}),env)).status,401);
 const login=await opportunityApi(post('session/login',headers),env);assert.equal(login.status,200);
 const set=login.headers.get('set-cookie');assert.match(set,/HttpOnly/);assert.match(set,/SameSite=Strict/);assert.match(set,/Secure/);assert.match(set,/Max-Age=2592000/);
 const cookie=set.split(';')[0];assert.ok(!db.sessions.has(cookie.split('=')[1]));
 const request=new Request(base+'overview',{headers:{cookie}});assert.equal((await opportunityApi(request,env)).status,200);
 assert.equal((await opportunityApi(request,{...env,OPPORTUNITY_OWNER_TOKEN:'z'.repeat(40)})).status,401);
 assert.equal((await opportunityApi(new Request(base+'prospects',{method:'POST',headers:{cookie},body:'{}'}),env)).status,401);
 assert.equal((await opportunityApi(post('session/logout',{cookie}),env)).status,200);
 assert.equal((await opportunityApi(request,env)).status,401);
 const second=await opportunityApi(post('session/login',headers),env),c2=second.headers.get('set-cookie').split(';')[0];
 for(const s of db.sessions.values())s.expires_at=0;
 assert.equal((await opportunityApi(new Request(base+'overview',{headers:{cookie:c2}}),env)).status,401);
});
