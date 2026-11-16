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
  <div><p class="construction-kicker">Superior ProConnect • Construction</p><h3>Find help for your next project.</h3><p>Connect with local construction and home-service professionals. Browse available profiles, review service areas and customer feedback, and request quotes directly from listed businesses.</p></div>
 </div>
 <div class="construction-actions"><a class="btn btn-primary" href="#pros">Find Construction Professionals</a><a class="btn btn-outline" href="#advertise">Join as a Construction Pro</a></div>
 <h3 class="construction-subheading">Explore construction services</h3>
 <div class="construction-services">
  <span>Remodeling</span><span>Kitchen &amp; Bathroom</span><span>Flooring</span><span>Drywall</span><span>Painting</span><span>Home Repairs</span><span>Patios &amp; Decks</span><span>Property Maintenance</span>
 </div>
 <div class="construction-how"><h3>How the construction network works</h3><p><strong>Customers:</strong> Find a business, review its profile and service area, then contact the professional to discuss the project and request a quote.</p><p><strong>Professionals:</strong> Apply to be listed, choose your service territory and membership tier, and manage customer inquiries through your professional workspace.</p><p class="construction-note">Business availability and services vary. The membership checkout and any future customer job-posting or bidding features are separate from the live directory.</p></div>
 <h3 class="construction-subheading">Construction memberships and estimates</h3>
`;
constructionView.querySelector('.container').insertBefore(constructionIntro,constructionPlans);
const automotiveView=createNetworkView('automotive','Automotive Network',automotivePlans);
const automotiveIntro=document.createElement('div');
automotiveIntro.className='construction-overview';
automotiveIntro.innerHTML=`
 <div class="construction-lead">
  <img class="approved-logo" src="/logos/Superior_Automotive_Network.jpg" alt="Superior ProConnect Automotive Network logo" width="132" height="132"/>
  <div><p class="construction-kicker">Superior ProConnect • Automotive</p><h3>Connect with automotive service professionals.</h3><p>Browse listed automotive businesses, check their service areas and published reviews, and request a quote directly from a provider.</p></div>
 </div>
 <div class="construction-actions"><a class="btn btn-primary" href="#pros">Find Automotive Professionals</a><a class="btn btn-outline" href="#advertise">Join as an Automotive Pro</a></div>
 <h3 class="construction-subheading">Explore automotive services</h3>
 <div class="construction-services">
  <span>Diagnostics</span><span>Engine Repair</span><span>Brakes</span><span>Suspension</span><span>Maintenance</span><span>Electrical</span><span>Detailing</span><span>Body &amp; Paint</span>
 </div>
 <div class="construction-how"><h3>How the automotive network works</h3><p><strong>Customers:</strong> Find and review available businesses, then contact a professional about your vehicle and requested service.</p><p><strong>Professionals:</strong> Apply for a listing, choose your membership and service area, and manage incoming inquiries in your professional workspace.</p><p class="construction-note">Available services vary by business. The monthly membership and per-estimate payment are separate. Customer job-posting and private bidding are not yet available.</p></div>
 <h3 class="construction-subheading">Automotive memberships and estimates</h3>
`;
automotiveView.querySelector('.container').insertBefore(automotiveIntro,automotivePlans);
const appScreens={
 home:['#home','.ticker','#how','.faq'],
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
 let screen=isProfile?'profile':hash.slice(1);
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
 window.scrollTo({top:0,behavior:'instant'});
}

$('#search').addEventListener('input',directory);
const coverageMode=$('#coverage-mode');
function syncCoverage(){const mode=coverageMode.value;$('#coverage-areas-group').hidden=mode!=='cities';$('#coverage-radius-group').hidden=mode!=='radius';$('#coverage-states-group').hidden=mode!=='states';$('#coverage-areas').required=mode==='cities';$('#coverage-zip').required=mode==='radius';$('#coverage-states').required=mode==='states'}
coverageMode.addEventListener('change',syncCoverage);syncCoverage();
document.addEventListener('click',e=>{const b=e.target.closest('[data-stars]');if(!b)return;selectedStars=Number(b.dataset.stars);document.querySelectorAll('[data-stars]').forEach(el=>{el.classList.toggle('active',Number(el.dataset.stars)<=selectedStars);el.setAttribute('aria-pressed',String(Number(el.dataset.stars)===selectedStars))})});
document.addEventListener('submit',async e=>{if(e.target.id!=='review-form')return;e.preventDefault();const form=e.target,status=$('#review-status'),submit=form.querySelector('[type=submit]');status.textContent='Submitting…';status.classList.remove('error');submit.disabled=true;try{const fd=new FormData(form);const data={profileId:selected,stars:selectedStars,name:fd.get('name'),comment:fd.get('comment'),website:fd.get('website')};const r=await api('/api/reviews',{method:'POST',body:JSON.stringify(data)});status.textContent=r.message||'Review submitted for moderation.';form.reset();selectedStars=5;document.querySelectorAll('[data-stars]').forEach(el=>el.classList.toggle('active',Number(el.dataset.stars)<=5))}catch(err){status.textContent=err.message;status.classList.add('error')}finally{submit.disabled=false}});
document.addEventListener('submit',async e=>{if(e.target.id!=='quote-form')return;e.preventDefault();const form=e.target,button=form.querySelector('button'),status=$('#quote-status');button.disabled=true;status.textContent='Sending your request…';status.classList.remove('error');try{const values=Object.fromEntries(new FormData(form));const out=await api('/api/inquiries',{method:'POST',body:JSON.stringify({...values,profileId:selected,consent:form.elements.consent.checked})});form.reset();status.textContent=out.message}catch(e){status.textContent=e.message;status.classList.add('error')}finally{button.disabled=false}});
$('#join-form').addEventListener('submit',async e=>{e.preventDefault();const form=e.target,status=$('#join-status'),submit=form.querySelector('[type=submit]');status.classList.remove('error');status.textContent='Submitting your business details…';submit.disabled=true;try{const fd=new FormData(form);const data=Object.fromEntries(fd.entries());await api('/api/join',{method:'POST',body:JSON.stringify(data)});status.textContent='Application received. Membership enrollment is being finalized. No payment has been taken and no founding-member spot is reserved.'}catch(err){status.textContent=err.message;status.classList.add('error')}finally{submit.disabled=false}});
(async()=>{try{const data=await api('/api/profiles');profiles=data.profiles;directory()}catch{$('#directory-list').innerHTML='<div class="empty">Business listings are temporarily unavailable.</div>'}route()})();window.addEventListener('hashchange',route);if('serviceWorker'in navigator&&location.protocol==='https:')window.addEventListener('load',()=>navigator.serviceWorker.register('/service-worker.js').catch(()=>{}));
})();
