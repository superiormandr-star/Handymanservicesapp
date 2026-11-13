'use strict';
let providers=[];
const search=document.querySelector('#search'),status=document.querySelector('#result-status'),list=document.querySelector('#providers-list'),retry=document.querySelector('#retry');
const isAutomotive=p=>p.industry==='automotive'||String(p.name||'').toLowerCase().replace(/[^a-z]/g,'').startsWith('bestwrenchworx');
function render(){
 const query=search.value.trim().toLowerCase();
 const matches=providers.filter(p=>[p.name,p.city,p.area,...(p.services||[])].join(' ').toLowerCase().includes(query));
 list.replaceChildren();
 status.textContent=matches.length?`${matches.length} automotive ${matches.length===1?'business':'businesses'} found.`:query?'No matching automotive businesses. Try a different service or area.':'No automotive businesses are published yet. Shop owners can apply below.';
 for(const profile of matches){
  const card=document.createElement('article');card.className='provider';
  const title=document.createElement('h3');title.textContent=profile.name;
  const area=document.createElement('p');area.textContent=profile.area||profile.city||'Contact this provider for its service area.';
  const services=document.createElement('p');services.className='services';services.textContent=(profile.services||[]).join(' · ');
  const link=document.createElement('a');link.href='/#profile/'+encodeURIComponent(profile.id);link.textContent='View shop & request a quote →';
  card.append(title,area,services,link);list.append(card);
 }
}
async function load(){
 retry.hidden=true;status.textContent='Loading automotive providers…';
 try{const response=await fetch('/api/profiles');if(!response.ok)throw Error('Unavailable');const data=await response.json();if(!Array.isArray(data.profiles))throw Error('Invalid directory');providers=data.profiles.filter(isAutomotive);render();}
 catch{list.replaceChildren();status.textContent='The automotive directory is temporarily unavailable. Please try again.';retry.hidden=false;}
}
document.querySelector('#search-form').addEventListener('submit',event=>{event.preventDefault();render()});
search.addEventListener('input',render);retry.addEventListener('click',load);load();
