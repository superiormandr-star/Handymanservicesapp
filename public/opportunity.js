'use strict';
const $=id=>document.getElementById(id);let token='';
const status=(s)=>{$('status').textContent=s};
const el=(tag,text)=>{const x=document.createElement(tag);x.textContent=text;return x};
async function api(path,method='GET',body){const r=await fetch('/api/opportunity/'+path,{method,headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error||'Request failed');return d}
const dollars=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100);
function field(parent,label,control){const l=el('label',label);l.append(control);parent.append(l);return control}
function render(rows){$('metrics').replaceChildren();$('records').replaceChildren();
 for(const [label,value] of [['Prospects',rows.length],['Confirmed demos',rows.filter(r=>r.status==='demo_booked').length],['Contracted monthly',dollars(rows.reduce((s,r)=>s+r.monthly_cents,0))],['Contracted setup',dollars(rows.reduce((s,r)=>s+r.setup_cents,0))]]){const x=el('div','');x.className='metric';x.append(el('small',label),el('strong',String(value)));$('metrics').append(x)}
 for(const r of rows){const card=el('article','');card.append(el('h3',r.business),el('p',r.city+' · '+r.industry+' · score '+r.score+'/100'),el('small','Source: '+r.source+' | '+r.website));const form=el('form','');const grid=el('div','');grid.className='grid';form.append(grid);
 const select=field(grid,'Status',el('select',''));for(const s of ['new','contacted','demo_booked','proposal','client','closed']){const o=el('option',s.replaceAll('_',' '));o.value=s;select.append(o)}select.value=r.status;
 const date=field(grid,'Confirmed demo (your local time)',el('input',''));date.type='datetime-local';if(r.demo_at){const d=new Date(r.demo_at);date.value=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)}
 const setup=field(grid,'Contracted setup ($)',el('input','')),monthly=field(grid,'Contracted monthly ($)',el('input',''));for(const [x,v] of [[setup,r.setup_cents],[monthly,r.monthly_cents]]){x.type='number';x.min='0';x.step='.01';x.value=(v/100).toFixed(2)}
 const button=el('button','Save changes');form.append(button);form.onsubmit=async e=>{e.preventDefault();button.disabled=true;try{await api('prospects/'+r.id,'PATCH',{status:select.value,demoAt:date.value?new Date(date.value).toISOString():'',setupCents:Math.round(Number(setup.value)*100),monthlyCents:Math.round(Number(monthly.value)*100)});await load();status('Saved.')}catch(e){status(e.message);button.disabled=false}};card.append(form);$('records').append(card)}
 if(!rows.length)$('records').append(el('p','No prospects yet. Add a verified public business record.'))}
function networkRender(d){
 const sections=d.sections;const metrics=$('network-metrics'),details=$('network-details');metrics.replaceChildren();details.replaceChildren();
 const count=(key,predicate)=>sections[key]?.available?sections[key].rows.filter(predicate).reduce((a,r)=>a+Number(r.count||0),0):'Unavailable';
 for(const [label,value] of [['Open jobs',count('jobs',r=>r.status==='open')],['Active paid memberships',count('members',r=>r.status==='active'&&r.payment_status==='confirmed')],['Pending applications',count('members',r=>r.status==='pending')],['Estimate records',count('estimates',()=>true)]]){const item=el('div','');item.className='metric';item.append(el('small',label),el('strong',String(value)));metrics.append(item)}
 for(const [key,title,format] of [['recentJobs','Recent customer jobs',r=>[r.title,r.city,r.industry,r.status].join(' · ')],['recentMembers','Recent membership applications',r=>[r.business,r.city,r.industry,r.tier,r.status,r.payment_status].join(' · ')],['estimates','Estimate record counts',r=>[r.industry,r.estimate_status,r.count].join(' · ')],['payments','Verified recorded payment events (not reconciled)',r=>[r.kind,r.currency,r.status,r.count+' events',(Number(r.amount_cents)/100).toFixed(2)].join(' · ')]]){const block=el('article','');block.append(el('h3',title));const s=sections[key];if(!s?.available)block.append(el('p','Source unavailable or not migrated.'));else if(!s.rows.length)block.append(el('p','No records in this source.'));else for(const r of s.rows)block.append(el('p',format(r)));details.append(block)}
 $('network-status').textContent='Source checked '+new Date(d.checkedAt).toLocaleString();
}
async function load(){
 if($('network-overview')){const d=await api('overview');networkRender(d);try{const p=await api('prospects');render(p.prospects)}catch(e){$('metrics').replaceChildren();$('records').replaceChildren(el('p',e.message));}}
 else{const d=await api('prospects');render(d.prospects)}
}
$('signin').onsubmit=async e=>{e.preventDefault();token=$('token').value;$('token').value='';try{await load();$('login').hidden=true;$('workspace').hidden=false;status('Owner access verified.')}catch(e){token='';status(e.message)}};
$('logout').onclick=()=>{token='';$('records').replaceChildren();$('metrics').replaceChildren();if($('network-metrics')){$('network-metrics').replaceChildren();$('network-details').replaceChildren();$('network-status').textContent=''}$('workspace').hidden=true;$('login').hidden=false;status('Signed out.')};
$('refresh').onclick=()=>load().catch(e=>status(e.message));
$('new').onsubmit=async e=>{e.preventDefault();const f=e.target,b=f.querySelector('button');b.disabled=true;const data=Object.fromEntries(new FormData(f));for(const k of ['inbound','bookingGap','highValue'])data[k]=f.elements[k].checked;try{await api('prospects','POST',data);f.reset();await load();status('Prospect added.')}catch(e){status(e.message)}finally{b.disabled=false}};
