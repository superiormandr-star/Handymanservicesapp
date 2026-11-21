(()=>{'use strict';
let profiles=[],selected='superior',selectedStars=5;
const $=(s,root=document)=>root.querySelector(s);const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const api=async(url,options={})=>{const res=await fetch(url,{...options,headers:{'content-type':'application/json',...options.headers}});let val=await res.json();if(!res.ok)throw Error(val.error||'Request failed');return val};
const phoneLink=s=>'tel:'+String(s||'').replace(/[^\d+]/g,'');const smsLink=s=>'sms:'+String(s||'').replace(/[^\d+]/g,'');
const safeWebsite=s=>/^https:\/\//.test(String(s))?s:'#';
let installPrompt=null;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event});
$('#install-app')?.addEventListener('click',async()=>{if(installPrompt){await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null}else $('#install-help').showModal()});
$('#close-install-help')?.addEventListener('click',()=>$('#install-help').close());
function listing(p){if(p.id==='superior')p={...p,logo:'/superior-logo.png'};const tags=(p.services||[]).slice(0,4).map(s=>`<span class="tag">${escapeHtml(s)}</span>`).join('');return `<article class="listing"><div class="listing-top">${p.featured?'<span class="featured">FIRST FEATURED BUSINESS</span>':''}${p.logo?`<img src="${escapeHtml(p.logo)}" alt="${escapeHtml(p.name)} business logo" loading="lazy">`:`<span class="fallback">${escapeHtml(p.name)}</span>`}</div><div class="listing-body"><div class="location">⌖ ${escapeHtml(p.area||p.city)}</div><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.description||'Contact this provider to discuss your project.')}</p><div class="service-tags">${tags}</div><div class="listing-actions"><a class="btn btn-primary btn-small" href="#profile/${encodeURIComponent(p.id)}">View Business & Reviews →</a><a class="btn btn-navy btn-small" href="${phoneLink(p.phone)}">Call</a></div></div></article>`}
function directory(){const q=$('#search').value.trim().toLowerCase();const matched=profiles.filter(p=>[p.name,p.city,p.area,p.description,p.coverageMode,p.coverageZip,(p.coverageAreas||[]).join(' '),...(p.services||[])].join(' ').toLowerCase().includes(q));$('#directory-list').innerHTML=matched.length?matched.map(listing).join(''):'<div class="empty">No matching businesses listed yet. Try another service or city.</div>'}
function quoteForm(p){return `<section class="panel quote-intake"><h3>Request a quote</h3><p>Describe your project for ${escapeHtml(p.name)}. Your contact details are shared privately with this business and the directory owner.</p><form id="quote-form"><label>Your name<input name="name" required minlength="2" maxlength="100" autocomplete="name"></label><div class="fields"><label>Email<input name="email" type="email" maxlength="180" autocomplete="email"></label><label>Phone<input name="phone" type="tel" maxlength="40" autocomplete="tel"></label></div><p class="coverage-help">Provide an email address or phone number so the business can reply.</p><label>Project city / ZIP<input name="location" required maxlength="150" placeholder="Where is the work needed?"></label><label>Project details<textarea name="description" required minlength="15" maxlength="3000" rows="4" placeholder="Describe the work, timing, and any measurements you have."></textarea></label><label class="consent"><input name="consent" type="checkbox" required> I allow this business to contact me about this project. I have read the <a href="/privacy.html" target="_blank" rel="noopener">privacy information</a>.</label><input class="honey" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"><button class="btn btn-primary" type="submit">Send quote request →</button><p id="quote-status" role="status" class="form-status"></p></form></section>`}
function profileTemplate(p){if(p.id==='superior')p={...p,logo:'/superior-logo.png'};return `<div class="profile-hero"><div class="profile-logo">${p.logo?`<img src="${escapeHtml(p.logo)}" alt="${escapeHtml(p.name)} business logo">`:'<div class="fallback">'+escapeHtml(p.name)+'</div>'}</div><div class="profile-content"><div class="eyebrow orange">SERVICE PROVIDER • ${escapeHtml(p.city)}</div><h2>${escapeHtml(p.name)}</h2><p><b>${escapeHtml(p.tagline||'Service provider')}</b></p><p>${escapeHtml(p.description)}</p><div class="service-tags">${(p.services||[]).map(s=>`<span class="tag">${escapeHtml(s)}</span>`).join('')}</div><div class="listing-actions"><a class="btn btn-primary" href="${phoneLink(p.phone)}">Call ${escapeHtml(p.phone||'Business')} ↗</a>${p.phone?`<a class="btn btn-navy" href="${smsLink(p.phone)}">Send a Text</a>`:''}${p.website&&safeWebsite(p.website)!=='#'?`<a class="btn btn-navy" href="${escapeHtml(safeWebsite(p.website))}" target="_blank" rel="noopener noreferrer">Business Website ↗</a>`:''}</div></div></div>${quoteForm(p)}<div class="profile-grid"><div class="panel"><h3>About this business</h3><p>${escapeHtml(p.description)}</p><p><b>Service area:</b> ${escapeHtml(p.area||p.city)}</p>${p.coverageMode==='radius'&&p.coverageZip?`<span class="coverage-badge">${escapeHtml(p.coverageRadius)}-mile radius from ${escapeHtml(p.coverageZip)}</span>`:''}${Array.isArray(p.coverageAreas)&&p.coverageAreas.length?`<p><b>Areas served:</b> ${escapeHtml(p.coverageAreas.join(', '))}</p>`:''}<p>Contact the business directly for project availability, terms, and estimates.</p><h3>Customer ratings</h3><div id="rating-overview" aria-live="polite">Loading ratings…</div><div id="review-list" class="review-list" aria-live="polite"></div></div><div class="panel"><h3>Leave a review</h3><p>Worked with ${escapeHtml(p.name)}? Share your honest experience. Reviews are screened before appearing publicly.</p><form id="review-form" class="review-form"><label for="review-name">Your first name</label><input id="review-name" name="name" required minlength="2" maxlength="65" placeholder="Your first name"/><label>Your rating</label><div id="stars" class="star-picker" role="group" aria-label="Star rating">${[1,2,3,4,5].map(n=>`<button type="button" data-stars="${n}" aria-label="${n} star${n===1?'':'s'}" class="${n<=selectedStars?'active':''}">★</button>`).join('')}</div><label for="review-comment">Your experience</label><textarea id="review-comment" name="comment" rows="5" required minlength="15" maxlength="800" placeholder="Tell other customers about the project and your experience"></textarea><input class="honey" name="website" type="text" tabindex="-1" autocomplete="off" aria-hidden="true"/><button class="btn btn-primary" type="submit">Submit for review →</button><p id="review-status" class="form-status" role="status" aria-live="polite"></p></form><p style="font-size:11px">Reviews are opinions of customers. A submission does not guarantee publication.</p></div></div>`}
async function loadReviews(){try{const d=await api('/api/reviews?profile='+encodeURIComponent(selected));$('#rating-overview').innerHTML=d.total?`<div class="review-head"><span class="stars" aria-label="${d.average} out of 5">${'★'.repeat(Math.round(d.average))}${'☆'.repeat(5-Math.round(d.average))}</span><strong>${d.average}/5 · ${d.total} review${d.total===1?'':'s'}</strong></div>`:'<p>No published customer reviews yet. Be the first to share your experience.</p>';$('#review-list').innerHTML=d.reviews.map(r=>`<article class="review"><div class="review-head"><b>${escapeHtml(r.name)}</b><span class="stars" aria-label="${r.stars} out of 5">${'★'.repeat(r.stars)}${'☆'.repeat(5-r.stars)}</span></div><p>${escapeHtml(r.comment)}</p><small>${new Date(r.createdAt).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'})}</small>${r.ownerReply?`<div class="reply"><b>Business response:</b> ${escapeHtml(r.ownerReply)}</div>`:''}</article>`).join('')}catch{$('#rating-overview').textContent='Ratings are temporarily unavailable.'}}
// Dedicated in-app views preserve existing forms, checkout links, and approved branding.
const appMain=$('#main');
const constructionPlans=$('#construction-memberships');
const automotivePlans=$('#automotive-memberships');
function createNetworkView(id,heading,plans){
 const view=document.createElement('section');
 view.id=id;
 view.className='app-network-view';
 view.hidden=true;
 view.innerHTML='<div class="container"><a class="app-back" href="#home" aria-label="Back to home">← Back to Home</a><h2>'+heading+'</h2><p>Explore the network memberships and estimate services.</p></div>';
 view.querySelector('.container').appendChild(plans);
 appMain.appendChild(view);
 return view;
}
const constructionView=createNetworkView('construction','Construction Network',constructionPlans);
const constructionIntro=document.createElement('div');
constructionIntro.className='construction-overview';
constructionIntro.innerHTML=`
 <div class="construction-lead">
  <img class="approved-logo" src="/logos/Superior_Construction_Network.jpg" alt="Superior ProConnect Construction Network logo" width="132" height="132"/>
  <div><p class="construction-kicker">Superior ProConnect • Construction</p><h3>Find help for your next project.</h3><p>Post a construction or home-service job, receive the private estimates you authorize, and choose whom to hire. You can also browse listed professional profiles and published reviews.</p></div>
 </div>
 <div class="construction-actions"><a class="btn btn-primary" href="#customers">Post a Construction Job</a><a class="btn btn-outline" href="#advertise">Join as a Construction Pro</a></div>
 <h3 class="construction-subheading">Explore construction services</h3>
 <div class="construction-services">
  <span>Remodeling</span><span>Kitchen &amp; Bathroom</span><span>Flooring</span><span>Drywall</span><span>Painting</span><span>Home Repairs</span><span>Patios &amp; Decks</span><span>Property Maintenance</span>
 </div>
 <div class="construction-how"><h3>How the construction network works</h3><p><strong>Customers:</strong> Post a job for free, select one to three private estimates, review verified responses, and choose your professional. Your private contact information stays hidden until selection.</p><p><strong>Professionals:</strong> Apply to be listed, choose your service territory and membership tier, and manage customer inquiries through your professional workspace.</p><p class="construction-note">Services vary by professional. Private job posting is available; new recurring membership checkout remains disabled until PayPal lifecycle verification is complete.</p></div>
 <h3 class="construction-subheading">Construction memberships and estimates</h3>
`;
constructionView.querySelector('.container').insertBefore(constructionIntro,constructionPlans);
const automotiveView=createNetworkView('automotive','Automotive Network',automotivePlans);
const automotiveIntro=document.createElement('div');
automotiveIntro.className='construction-overview';
automotiveIntro.innerHTML=`
 <div class="construction-lead">
  <img class="approved-logo" src="/logos/Superior_Automotive_Network.jpg" alt="Superior ProConnect Automotive Network logo" width="132" height="132"/>
  <div><p class="construction-kicker">Superior ProConnect • Automotive</p><h3>Connect with automotive service professionals.</h3><p>Post an automotive service request for free, choose how many private estimates to receive, and select a professional. Business profiles and published reviews remain available.</p></div>
 </div>
 <div class="construction-actions"><a class="btn btn-primary" href="#customers">Post an Automotive Job</a><a class="btn btn-outline" href="#advertise">Join as an Automotive Pro</a></div>
 <h3 class="construction-subheading">Explore automotive services</h3>
 <div class="construction-services">
  <span>Diagnostics</span><span>Engine Repair</span><span>Brakes</span><span>Suspension</span><span>Maintenance</span><span>Electrical</span><span>Detailing</span><span>Body &amp; Paint</span>
 </div>
 <div class="construction-how"><h3>How the automotive network works</h3><p><strong>Customers:</strong> Post an automotive job, receive verified private estimates up to your chosen limit, and decide which professional to contact.</p><p><strong>Professionals:</strong> Apply for a listing, choose your membership and service area, and manage incoming inquiries in your professional workspace.</p><p class="construction-note">Available services vary by business. Private estimates require verified professional eligibility; new subscription checkout is disabled pending PayPal lifecycle verification.</p></div>
 <h3 class="construction-subheading">Automotive memberships and estimates</h3>
`;
automotiveView.querySelector('.container').insertBefore(automotiveIntro,automotivePlans);
const appScreens={
 home:['#customer-shortcut','#home','.ticker','#how','.faq'],
 customers:['#customers'],
 pros:['#pros'],
 how:['#how','.faq'],
 advertise:['#advertise'],
 construction:['#construction'],
 automotive:['#automotive'],
 profile:['#profile']
};
$('#pc-launch')?.setAttribute('hidden','');
function route(){
 const hash=decodeURIComponent(location.hash||'#home');
 const isProfile=hash.startsWith('#profile/');
 const isPrivateJob=hash.startsWith('#my-job/');
 let screen=isProfile?'profile':isPrivateJob?'customers':hash.slice(1);
 if(screen==='construction-memberships')screen='construction';
 if(screen==='automotive-memberships')screen='automotive';
 if(!Object.hasOwn(appScreens,screen))screen='home';
 const profile=$('#profile');
 for(const section of appMain.querySelectorAll(':scope > section'))section.hidden=true;
 for(const selector of appScreens[screen]){
  const el=$(selector,appMain);if(el)el.hidden=false;
 }
 if(isProfile){
  selected=hash.split('/').slice(1).join('/')||'superior';
  const p=profiles.find(p=>p.id===selected);
  if(p){selectedStars=5;$('#profile-body').innerHTML=profileTemplate(p);loadReviews()}
  else $('#profile-body').innerHTML='<p>Business not found. <a href="#pros">Return to directory</a>.</p>';
 }
 document.querySelectorAll('.desktop-nav a,.bottom-nav a').forEach(link=>{
  const active=link.getAttribute('href')==='#'+screen;
  link.classList.toggle('active',active);
  if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
 });
 if(screen==='customers'){
  $('#customer-post-area').hidden=isPrivateJob;
  $('#customer-job-dashboard').hidden=!isPrivateJob;
  if(isPrivateJob)showPrivateJob();
 }
 window.scrollTo({top:0,behavior:'instant'});
}

$('#search').addEventListener('input',directory);
const coverageMode=$('#coverage-mode');
function syncCoverage(){const mode=coverageMode.value;$('#coverage-areas-group').hidden=mode!=='cities';$('#coverage-radius-group').hidden=mode!=='radius';$('#coverage-states-group').hidden=mode!=='states';$('#coverage-areas').required=mode==='cities';$('#coverage-zip').required=mode==='radius';$('#coverage-states').required=mode==='states'}
coverageMode.addEventListener('change',syncCoverage);syncCoverage();
document.addEventListener('click',e=>{const b=e.target.closest('[data-stars]');if(!b)return;selectedStars=Number(b.dataset.stars);document.querySelectorAll('[data-stars]').forEach(el=>{el.classList.toggle('active',Number(el.dataset.stars)<=selectedStars);el.setAttribute('aria-pressed',String(Number(el.dataset.stars)===selectedStars))})});
document.addEventListener('submit',async e=>{if(e.target.id!=='review-form')return;e.preventDefault();const form=e.target,status=$('#review-status'),submit=form.querySelector('[type=submit]');status.textContent='Submitting…';status.classList.remove('error');submit.disabled=true;try{const fd=new FormData(form);const data={profileId:selected,stars:selectedStars,name:fd.get('name'),comment:fd.get('comment'),website:fd.get('website')};const r=await api('/api/reviews',{method:'POST',body:JSON.stringify(data)});status.textContent=r.message||'Review submitted for moderation.';form.reset();selectedStars=5;document.querySelectorAll('[data-stars]').forEach(el=>el.classList.toggle('active',Number(el.dataset.stars)<=5))}catch(err){status.textContent=err.message;status.classList.add('error')}finally{submit.disabled=false}});
document.addEventListener('submit',async e=>{if(e.target.id!=='quote-form')return;e.preventDefault();const form=e.target,button=form.querySelector('button'),status=$('#quote-status');button.disabled=true;status.textContent='Sending your request…';status.classList.remove('error');try{const values=Object.fromEntries(new FormData(form));const out=await api('/api/inquiries',{method:'POST',body:JSON.stringify({...values,profileId:selected,consent:form.elements.consent.checked})});form.reset();status.textContent=out.message}catch(e){status.textContent=e.message;status.classList.add('error')}finally{button.disabled=false}});


/* Customers post their own jobs; no direct provider selection or client-side contact release. */
const jobMessage=(text,error=false,id='#customer-job-status')=>{
 const box=$(id);box.textContent=text;box.classList.toggle('error',error);
};
const privateJobPath=()=>location.hash.match(/^#my-job\/([0-9a-f-]{36})\/([a-f0-9]{64})$/i);
async function ownJobRequest(path,key,data){
 const response=await fetch(path,{method:data?'POST':'GET',cache:'no-store',
  headers:{'content-type':'application/json','x-customer-key':key},
  body:data?JSON.stringify(data):undefined});
 const out=await response.json();
 if(!response.ok)throw Error(out.error||'Job request failed.');
 return out;
}
async function showPrivateJob(){
 const match=privateJobPath();
 if(!match)return jobMessage('Your private management link is incomplete.',true,'#customer-dashboard-status');
 const [raw,id,key]=match;
 const ownUrl=location.origin+location.pathname+'#my-job/'+id+'/'+key;
 const link=$('#customer-private-link');link.value=ownUrl;
 jobMessage('Loading your private job…',false,'#customer-dashboard-status');
 try{
  const item=await ownJobRequest('/api/jobs/'+encodeURIComponent(id),key);
  if(location.hash!=='#my-job/'+id+'/'+key)return;
  $('#customer-job-summary').textContent=item.title+' · '+item.city+' · '+item.industry+
   ' · '+item.receivedEstimates+' received estimates · '+
   item.remainingSlots+' slot(s) available or reserved · '+item.status.toUpperCase();
  const node=$('#customer-job-bids');
  if(item.bids.length){
   node.innerHTML='<h4>Private estimates</h4>'+item.bids.map(b=>'<article class="customer-bid-card"><h4>'+
    escapeHtml(b.professional.name)+'</h4><p>'+escapeHtml(b.professional.city||'')+'</p><strong>'+
    new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(b.amount)+'</strong><p>'+
    escapeHtml(b.scope)+'</p>'+((item.status==='open')?'<button type="button" class="btn btn-outline" data-decline-bid="'+escapeHtml(b.id)+'">Decline</button><button type="button" class="btn btn-primary" data-select-private-bid="'+escapeHtml(b.id)+'">Select this professional</button>':'')+'</article>').join('');
  }else node.innerHTML='<p class="customer-note">No verified estimates yet. Pending payment requests are not delivered as bids. Check back using this private link.</p>';
  if(item.selectedProfessional)node.innerHTML+='<p class="customer-selected"><strong>You selected: '+escapeHtml(item.selectedProfessional.name)+'</strong><br>'+
   escapeHtml(item.selectedProfessional.phone||'No phone listed')+'<br>'+
   (item.selectedProfessional.website?'<a href="'+escapeHtml(item.selectedProfessional.website)+'" rel="noopener noreferrer" target="_blank">Professional website</a>':'')+
   '<br>Your private contact details were released to this selected professional only.</p>';
  window.jobFileLinks(item.attachments,node);
  if(item.status==='selected'){
   const chat=document.createElement('div');
   for(const m of item.messages||[]){const p=document.createElement('p');p.textContent=m.from+' · '+m.text;chat.append(p);}
   chat.insertAdjacentHTML('beforeend','<form id="customer-chat"><label>Message your professional<textarea name="text" required maxlength="1200"></textarea></label><button>Send message</button></form>');
   node.append(chat);
  }
  $('#customer-job-fourth').hidden=!(item.status==='open'&&item.bidLimit===3&&!item.fourthApproved&&item.receivedEstimates>=3);
  $('#customer-job-close').hidden=item.status!=='open';
  jobMessage('Job information loaded. Share only the public job description, never your private management link.',false,'#customer-dashboard-status');
 }catch(err){jobMessage(err.message,true,'#customer-dashboard-status')}
}
$('#customer-job-form').addEventListener('submit',async event=>{
 event.preventDefault();
 const form=event.currentTarget,button=form.querySelector('[type="submit"]');
 const fields=Object.fromEntries(new FormData(form));
 if(!fields.email&&!fields.phone){jobMessage('Enter a phone or email to receive a response.',true);return;}
 button.disabled=true;jobMessage('Posting your job…');
 try{
  const files=Array.from($('#job-files').files);
  if(files.length>3||files.some(f=>f.size>262144))throw Error('Choose up to three files of 256 KB each.');
  const attachments=await Promise.all(files.map(file=>new Promise((resolve,reject)=>{
   const reader=new FileReader();reader.onload=()=>resolve({name:file.name,bytes:reader.result.split(',')[1]});reader.onerror=()=>reject(Error('Could not read attachment.'));reader.readAsDataURL(file);
  })));
  const response=await api('/api/jobs',{method:'POST',headers:accountKey?{'x-customer-account':accountKey}:{},body:JSON.stringify({...fields,attachments,consent:form.elements.consent.checked,rulesAccepted:form.elements.rulesAccepted.checked})});
  if(!response.jobId||!response.customerKey)throw Error('Job link was not returned. Please contact the owner before posting again.');
  form.reset();location.hash='#my-job/'+response.jobId+'/'+response.customerKey;
  jobMessage('Posted. Save your private job link.');
 }catch(err){jobMessage(err.message,true)}
 finally{button.disabled=false}
});
$('#copy-customer-job').addEventListener('click',async()=>{
 const input=$('#customer-private-link');
 try{await navigator.clipboard.writeText(input.value);jobMessage('Private link copied. Store it securely.',false,'#customer-dashboard-status')}
 catch{input.select();jobMessage('Select and copy this private link.',false,'#customer-dashboard-status')}
});
let lastCustomerUpdate='';
setInterval(async()=>{
 const m=privateJobPath();
 if(!m||document.hidden)return;
 try{
  const job=await ownJobRequest('/api/jobs/'+m[1],m[2]);
  if(!privateJobPath()||location.hash!==m[0])return;
  const signature=[job.id,job.status,job.receivedEstimates,job.messages?.length||0].join('/');
  if(lastCustomerUpdate&&lastCustomerUpdate!==signature)jobMessage('Your job has an update. Refresh estimates to see the latest activity.',false,'#customer-dashboard-status');
  lastCustomerUpdate=signature;
 }catch{}
},60000);
$('#customer-job-refresh').addEventListener('click',()=>showPrivateJob());
$('#customer-job-bids').addEventListener('click',async e=>{
 const decline=e.target.closest('[data-decline-bid]');
 if(decline){const m=privateJobPath();if(m&&confirm('Decline this estimate?'))try{await ownJobRequest('/api/jobs/'+m[1]+'/reject',m[2],{bidId:decline.dataset.declineBid});await showPrivateJob();}catch(err){jobMessage(err.message,true,'#customer-dashboard-status');}return;}
 const bid=e.target.closest('[data-select-private-bid]');
 if(!bid||!confirm('Select this professional and release your private contact information to them? Other professionals will not receive it.'))return;
 const match=privateJobPath();if(!match)return;
 try{await ownJobRequest('/api/jobs/'+match[1]+'/select',match[2],{bidId:bid.dataset.selectPrivateBid});await showPrivateJob();}
 catch(err){jobMessage(err.message,true,'#customer-dashboard-status')}
});
$('#customer-job-close').addEventListener('click',async()=>{
 if(!confirm('Close this job to new bids? You will not be able to reopen it here.'))return;
 const match=privateJobPath();if(!match)return;
 try{await ownJobRequest('/api/jobs/'+match[1]+'/close',match[2],{});await showPrivateJob();}
 catch(err){jobMessage(err.message,true,'#customer-dashboard-status')}
});
$('#customer-job-fourth').addEventListener('click',async()=>{
 if(!confirm('You have received three verified estimates. Authorize exactly ONE additional (fourth) estimate? This is optional.'))return;
 const match=privateJobPath();if(!match)return;
 try{await ownJobRequest('/api/jobs/'+match[1]+'/fourth',match[2],{approveFourth:true});await showPrivateJob();}
 catch(err){jobMessage(err.message,true,'#customer-dashboard-status')}
});
let accountKey=sessionStorage.getItem('spc-customer')||'';
async function openAccount(key){
 const account=await api('/api/customer/account',{headers:{'x-customer-account':key}});accountKey=key;sessionStorage.setItem('spc-customer',key);
 $('#customer-register').hidden=true;$('#customer-signin').hidden=true;$('#customer-account-panel').hidden=false;
 $('#customer-account-name').textContent=account.name+' · '+account.jobs.length+' jobs';
 $('#account-jobs').replaceChildren(...account.jobs.map(j=>{const li=document.createElement('li'),a=document.createElement('a');a.href='#my-job/'+j.id+'/'+j.key;a.textContent=j.title+' · '+j.status;li.append(a);return li;}));
}
for(const id of ['customer-register','customer-signin']){
 $('#'+id).addEventListener('submit',async e=>{e.preventDefault();try{
  if(id==='customer-register'){const r=await api('/api/customer/account',{method:'POST',body:JSON.stringify({name:e.target.elements.name.value})});await openAccount(r.key);$('#customer-new-key').value=r.key;$('#customer-key-label').hidden=false;}
  else await openAccount(e.target.elements.key.value.trim());
  e.target.reset();$('#customer-account-status').textContent='';
 }catch(err){$('#customer-account-status').textContent=err.message;}});
}
$('#customer-signout').onclick=()=>{sessionStorage.removeItem('spc-customer');location.reload();};
window.addEventListener('hashchange',()=>{if(accountKey&&location.hash==='#customers')openAccount(accountKey).catch(e=>$('#customer-account-status').textContent=e.message);});
if(accountKey)openAccount(accountKey).catch(e=>$('#customer-account-status').textContent=e.message);
document.addEventListener('submit',async e=>{if(e.target.id!=='customer-chat')return;e.preventDefault();const m=privateJobPath();try{await ownJobRequest('/api/jobs/'+m[1]+'/message',m[2],{text:e.target.elements.text.value});await showPrivateJob();}catch(err){jobMessage(err.message,true,'#customer-dashboard-status');}});
document.addEventListener('click',e=>{
 const card=e.target.closest('.package-checkout')?.closest('[data-package-key]');
 const network=e.target.closest('#construction,#automotive');if(!network)return;
 const industry=network.id;
 if(e.target.closest('a[href="#advertise"]')){const f=$('#join-form');f.elements.industry.value=industry;if(card)f.elements.membership.value=card.dataset.packageKey.split('-')[1];}
 if(e.target.closest('a[href="#customers"]'))$('#customer-job-form').elements.industry.value=industry;
});
const spc2EnrollmentStore='spc2-enrollment';
function spc2MembershipSaved(){
 try{const raw=localStorage.getItem(spc2EnrollmentStore),val=raw?JSON.parse(raw):null;return val&&val.requestId&&val.accessKey?val:null}catch{return null}
}
async function spc2CheckMembership(){
 const record=spc2MembershipSaved(),status=$('#join-status');
 if(!record)return;
 try{
  const result=await api('/api/membership/status?id='+encodeURIComponent(record.requestId),{headers:{'x-membership-key':record.accessKey}});
  status.classList.remove('error');
  status.textContent=result.active
   ?'Your '+result.industry+' '+result.tier+' membership payment has been confirmed and your membership is active.'
   :'Your application is saved. Subscription status: '+result.paymentStatus+'. Paid access begins only after PayPal confirms your subscription.';
 }catch(err){status.classList.add('error');status.textContent='Could not check membership: '+err.message;}
}
document.addEventListener('click',e=>{
 const link=e.target.closest('.paypal-subscription-link');
 if(!link)return;
 const card=link.closest('[data-package-key]'),packageKey=card?.dataset.packageKey;
 if(!packageKey||!/^https:\/\/www\.paypal\.com\/webapps\/billing\/plans\/subscribe\?plan_id=P-[A-Z0-9]+$/.test(link.href))return;
 e.preventDefault();
 const [industry,tier]=packageKey.split('-'),form=$('#join-form');
 form.elements.industry.value=industry;form.elements.membership.value=tier;
 const prior=spc2MembershipSaved();
 if(prior?.packageKey===packageKey){
   const status=$('#join-status');
   status.classList.remove('error');
   status.textContent='A saved application for this package exists. Continue through PayPal or check your subscription status.';
   spc2CheckMembership();
 }
 $('#join-status').textContent='Complete this application, then the site will send you to the selected PayPal recurring subscription. Payment does not automatically grant access until PayPal confirmation.';
 location.hash='#advertise';form.scrollIntoView({behavior:'smooth',block:'center'});
 form.elements.business.focus();
});
$('#join-form').addEventListener('submit',async e=>{
 e.preventDefault();
 const form=e.target,status=$('#join-status'),submit=form.querySelector('[type=submit]');
 status.classList.remove('error');
 status.textContent='Saving your business application…';
 submit.disabled=true;
 try{
  const data=Object.fromEntries(new FormData(form).entries());
  const outcome=await api('/api/join',{method:'POST',body:JSON.stringify(data)});
  if(!outcome.requestId||!outcome.accessKey||!outcome.checkoutUrl)throw Error('Enrollment response was incomplete; no payment started.');
  const saved={requestId:outcome.requestId,accessKey:outcome.accessKey,packageKey:outcome.packageKey};
  localStorage.setItem(spc2EnrollmentStore,JSON.stringify(saved));
  status.textContent='Application saved. Opening PayPal to finish your recurring subscription. Your membership will activate after payment is confirmed.';
  location.assign(outcome.checkoutUrl);
 }catch(err){status.textContent=err.message;status.classList.add('error')}
 finally{submit.disabled=false}
});
if(spc2MembershipSaved()){
 const saved=spc2MembershipSaved(),form=$('#join-form'),controls=document.createElement('div');
 controls.className='form-status';controls.id='spc2-existing-membership';
 const button=document.createElement('button');button.type='button';button.className='btn btn-outline';
 button.textContent='Check my membership status';
 button.addEventListener('click',spc2CheckMembership);
 controls.appendChild(button);form.appendChild(controls);
}
(async()=>{try{const data=await api('/api/profiles');profiles=data.profiles;directory()}catch{$('#directory-list').innerHTML='<div class="empty">Business listings are temporarily unavailable.</div>'}route()})();window.addEventListener('hashchange',route);if('serviceWorker'in navigator&&location.protocol==='https:')window.addEventListener('load',()=>navigator.serviceWorker.register('/service-worker.js').catch(()=>{}));
})();
