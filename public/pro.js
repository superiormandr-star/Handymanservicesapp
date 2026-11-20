(()=>{'use strict';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(v||0);
let token='',data=null,selected=null;
const message=(v,error=false)=>{$('#message').textContent=v;$('#message').className=error?'error':''};
async function api(path,body){const r=await fetch(path,{method:body?'POST':'GET',cache:'no-store',headers:{'content-type':'application/json','x-pro-token':token},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw Error(d.error||'Request failed');return d}
async function load(){data=await api('/api/crm/workspace');$('#business').textContent=data.profile.name;$('#signin').hidden=true;$('#workspace').hidden=false;$('#access').value='';$('#stage').innerHTML='<option value="">All stages</option>'+data.stages.map(s=>'<option>'+esc(s)+'</option>').join('');render();if(selected)detail();await loadMarketplace().catch(e=>message('Customer job board: '+e.message,true))}
function render(){
 const m=data.membership;
 $('#member-panel').hidden=!m;
 if(m){$('#member-state').textContent=m.industry+' · '+m.package+' · '+m.billingStatus+(m.paidThrough?' · Paid through '+new Date(m.paidThrough).toLocaleDateString():'');$('#member-checkout').hidden=m.billingStatus==='ACTIVE';}
const q=$('#search').value.trim().toLowerCase(),stage=$('#stage').value,leads=data.leads;
 const today=new Date().toLocaleDateString('en-CA');
 $('#metrics').innerHTML=[[leads.length,'Real inquiries'],[leads.filter(l=>l.status==='New').length,'New inquiries'],[leads.filter(l=>l.status==='Paid').length,'Paid jobs'],[leads.filter(l=>l.reminderDate&&l.reminderDate<=today&&!['Paid','Declined'].includes(l.status)).length,'Reminders due']].map(([n,label])=>'<div class="metric"><strong>'+n+'</strong>'+label+'</div>').join('');
 const matched=leads.filter(l=>(!stage||l.status===stage)&&[l.name,l.email,l.phone,l.location,l.description].join(' ').toLowerCase().includes(q));
 $('#leads').innerHTML=matched.length?matched.map(l=>'<button class="lead" data-lead="'+esc(l.id)+'" aria-pressed="'+(selected===l.id)+'"><span class="pill">'+esc(l.status)+'</span><h3>'+esc(l.name)+'</h3>'+esc(l.description.slice(0,140))+'<small>'+esc(l.location)+' · '+new Date(l.createdAt).toLocaleDateString()+'</small>'+(l.reminderDate?'<small>Reminder: '+esc(l.reminderDate)+'</small>':'')+'</button>').join(''):'<div class="card">'+(leads.length?'No jobs match these filters.':'No inquiries yet. Customers can request a quote on your directory listing. Only real requests appear here.')+'</div>';
 $('#assistance-note').textContent=data.estimateAssistanceAvailable?'Estimate assistance intake is available by arrangement with the directory owner. Confirm pricing and service terms before requesting work.':'Estimate assistance is upcoming. Pricing and availability have not been announced. It is not included in the planned directory membership.';
 $('#requests').innerHTML=data.requests.map(r=>'<article class="card"><span class="pill">'+esc(r.status)+'</span><p>'+esc(r.scope)+'</p>'+(r.draft?'<div class="table-wrap"><table><thead><tr><th>Item</th><th>Qty</th><th>Rate</th></tr></thead><tbody>'+r.draft.items.map(i=>'<tr><td>'+esc(i.description)+'</td><td>'+esc(i.qty)+'</td><td>'+money(i.rate)+'</td></tr>').join('')+'</tbody></table></div><p>Total: <strong>'+money(r.draft.total)+'</strong> · Tax: '+money(r.draft.tax)+' · Deposit: '+money(r.draft.deposit)+'</p><p class="pre">'+esc(r.draft.scope)+'</p><p class="pre">Exclusions: '+esc(r.draft.exclusions||'None stated')+'</p><p class="pre">Terms: '+esc(r.draft.terms||'None stated')+'</p>':'')+(r.status==='Ready for Pro Review'?'<form data-review="'+esc(r.id)+'"><label>Corrections or review notes<textarea name="note" maxlength="1500"></textarea></label><button name="decision" value="approved">Approve draft</button><button class="secondary" name="decision" value="changes">Request changes</button></form>':'')+'</article>').join('');
}
function detail(){const l=data.leads.find(l=>l.id===selected);if(!l){$('#detail').hidden=true;return}$('#detail').hidden=false;
 $('#detail').innerHTML='<h2>'+esc(l.name)+'</h2><p>'+esc(l.email)+'<br>'+esc(l.phone)+'<br>'+esc(l.location)+'</p><p class="pre">'+esc(l.description)+'</p><small>'+esc(l.origin)+' · Contact permission recorded '+new Date(l.consentAt).toLocaleString()+'</small><form id="job-form"><label>Job stage<select name="status">'+data.stages.map(s=>'<option'+(s===l.status?' selected':'')+'>'+esc(s)+'</option>').join('')+'</select></label><label>Reminder date<input type="date" name="reminderDate" value="'+esc(l.reminderDate)+'"></label><label>Add private note<textarea name="note" maxlength="1500"></textarea></label><button>Save job</button></form><h3>Notes</h3>'+(l.notes.length?l.notes.map(n=>'<p class="note pre">'+esc(n.text)+'<br><small>'+new Date(n.at).toLocaleString()+'</small></p>').join(''):'<p class="muted">No notes yet.</p>')+'<details><summary>Job history</summary>'+l.history.map(h=>'<p>'+esc(h.status)+' · '+new Date(h.at).toLocaleString()+'</p>').join('')+'</details>'+(data.estimateAssistanceAvailable?'<form id="estimate-request"><h3>Request an estimate draft</h3><label>Scope, measurements, materials and exclusions<textarea name="scope" minlength="15" maxlength="3000" required></textarea></label><button>Request private draft</button></form>':'');
}

let marketplaceJobs=[];
async function loadMarketplace(){
 const payload=await api('/api/pro/jobs');
 marketplaceJobs=payload.jobs||[];
 const credits=payload.credits;
 $('#marketplace-billing').textContent=credits?
  'Owner-verified '+credits.tier+' membership for this month: '+credits.remaining+
  ' of '+credits.allowed+' included estimate credits remaining. Additional estimates: $18 Construction / $10 Automotive, once verified in PayPal.':
  'Your membership tier and estimate credits have not been verified for this month. Job details are visible; submissions are disabled to avoid incorrect charges.';
 renderMarketplace(Boolean(credits));
}
function renderMarketplace(verified){
 const box=$('#marketplace-jobs');
 if(!marketplaceJobs.length){
  box.innerHTML='<p class="muted">No matching customer jobs currently available to your professional profile.</p>';
  return;
 }
 box.innerHTML=marketplaceJobs.map(job=>{
  const safe=esc,owned=job.ownBid,contact=job.customerContact;
  let card='<article class="marketplace-job card"><div class="marketplace-head"><span class="pill">'+safe(job.industry)+
   '</span> <small>'+safe(job.city)+'</small></div><h3>'+safe(job.title)+'</h3>'+
   '<p class="pre">'+safe(job.description)+'</p>'+
   '<p class="muted">Estimate slots occupied or reserved: '+safe(job.filledSlots)+' / '+safe(job.bidLimit)+
   '. Remaining: '+safe(job.remainingSlots)+'. Status: '+safe(job.status)+'.</p>';
  if(contact){
   card+='<div class="selected-contact"><strong>Customer selected your estimate and authorized contact sharing.</strong>'+
    '<p>'+safe(contact.name)+' · '+safe(contact.email||'')+' · '+safe(contact.phone||'')+
    '</p><p>Job address (private): '+safe(contact.address||'Ask customer for details')+'</p></div>';
  }
  if(owned){
   card+='<p><strong>Your bid:</strong> '+money(owned.amount)+' · '+safe(owned.status)+
    '</p><p class="pre">'+safe(owned.scope)+'</p>';
   if(owned.status==='pending'&&owned.paymentReference){
    card+='<p class="muted">Transaction reference submitted. Waiting for owner to check PayPal; not yet visible to customer.</p>';
   }else if(owned.status==='pending'){
    card+='<p class="muted">Reserved until '+safe(owned.expiresAt)+
      '. Pay the one-time '+money(owned.fee)+' estimate fee only if your included credits are exhausted.</p>'+
      (owned.paymentLink?'<a class="button secondary" href="'+safe(owned.paymentLink)+
      '" target="_blank" rel="noopener noreferrer">Pay '+money(owned.fee)+' via PayPal</a>':'')+
      '<form data-payment-job="'+safe(job.id)+'" data-payment-bid="'+safe(owned.id)+'">'+
      '<label>PayPal transaction ID from receipt<input name="paymentReference" required minlength="6" maxlength="80"></label>'+
      '<button type="submit">Submit payment reference for owner review</button></form>';
   }else if(owned.status==='verified'){
    card+='<p class="muted">Your paid or included-credit estimate has been delivered privately to the customer. Wait for their selection.</p>';
   }
  }else if(job.status==='open'&&job.remainingSlots>0&&verified){
   card+='<form data-marketplace-bid="'+safe(job.id)+'">'+
     '<label>Price of your estimate ($)<input name="amount" type="number" min="0.01" max="100000000" step="0.01" required></label>'+
     '<label>Detailed scope and inclusions<textarea name="scope" minlength="15" maxlength="1800" required placeholder="Write your own estimate. Superior does not prepare or modify this bid."></textarea></label>'+
     '<label class="marketplace-consent"><input type="checkbox" name="feeAcknowledged" required> I understand my verified plan credits are used first. After they are exhausted, this estimate has a one-time '+money(job.industry==='automotive'?10:18)+' fee before it reaches the customer.</label>'+
     '<label class="marketplace-consent"><input type="checkbox" name="rulesAccepted" required> I agree to the <a href="/standards.html" target="_blank" rel="noopener">Rules &amp; Regulations</a> and <a href="/terms.html" target="_blank" rel="noopener">Terms of Use</a> (2026-11-16).</label>'+ 
     '<div class="marketplace-actions"><button type="submit">Submit private estimate / reserve slot</button>'+
     '<button type="button" class="secondary" data-marketplace-pass="'+safe(job.id)+'">Pass on job</button></div></form>';
  }else if(job.status==='open'&&job.remainingSlots>0&&!verified){
   card+='<p class="muted">Owner verification of your active membership is required before bidding. Contact the directory owner for an updated access grant.</p>';
  }else{
   card+='<p class="muted">This job is not accepting another estimate. No additional charge was taken.</p>';
  }
  if(contact){
   card+='<section data-job-files="'+safe(job.id)+'"></section><h4>Messages</h4>'+(job.messages||[]).map(m=>'<p>'+safe(m.from)+' · '+safe(m.text)+'</p>').join('')+
     '<form data-chat="'+safe(job.id)+'"><label>Message your customer<textarea name="text" required maxlength="1200"></textarea></label><button type="submit">Send message</button></form>';
  }
  return card+'</article>';
 }).join('');
 for(const el of box.querySelectorAll('[data-job-files]'))window.jobFileLinks(marketplaceJobs.find(j=>j.id===el.dataset.jobFiles)?.attachments,el);
}
$('#member-checkout').onclick=async e=>{
 const button=e.currentTarget;button.disabled=true;
 try{
  const m=data.membership,payload={industry:m.industry,membership:m.package,packageKey:m.industry+'-'+m.package};
  let result=await api('/api/membership-checkout',payload);
  if(result.reserved)result=await api('/api/membership-checkout',payload);
  if(result.checkoutUrl)location.assign(result.checkoutUrl);
  else $('#member-state').textContent=result.status||'Pending PayPal verification.';
 }catch(err){$('#member-state').textContent=err.message;}finally{button.disabled=false;}
};
$('#marketplace-refresh').addEventListener('click',async()=>{try{await loadMarketplace();message('Available jobs refreshed.')}catch(e){message(e.message,true)}});
$('#marketplace-jobs').addEventListener('click',async e=>{
 const button=e.target.closest('[data-marketplace-pass]');if(!button)return;
 if(!confirm('Pass on this opportunity? It will disappear from your available jobs.'))return;
 button.disabled=true;
 try{await api('/api/pro/jobs/'+button.dataset.marketplacePass+'/pass',{});await loadMarketplace();message('Job passed.')}
 catch(error){message(error.message,true);button.disabled=false;}
});
$('#marketplace-jobs').addEventListener('submit',async e=>{
 const f=e.target; if(!f.matches('[data-marketplace-bid],[data-payment-job],[data-chat]'))return;
 e.preventDefault();const button=f.querySelector('button[type=submit]');button.disabled=true;
 try{
  const values=Object.fromEntries(new FormData(f));
  if(f.dataset.chat){await api('/api/pro/jobs/'+f.dataset.chat+'/message',{text:values.text});message('Message sent.');}
  else if(f.dataset.marketplaceBid){
   await api('/api/pro/jobs/'+f.dataset.marketplaceBid+'/bids',{
    amount:Number(values.amount),scope:values.scope,feeAcknowledged:f.elements.feeAcknowledged.checked,rulesAccepted:f.elements.rulesAccepted.checked
   });
   message('Estimate submitted or reserved. Review the payment/credit status below.');
  }else{
   await api('/api/pro/jobs/'+f.dataset.paymentJob+'/bids/'+f.dataset.paymentBid+'/payment',{
    paymentReference:values.paymentReference
   });
   message('PayPal reference sent for owner verification. The customer cannot see this bid until it is verified.');
  }
  await loadMarketplace();
 }catch(error){message(error.message,true);}
 finally{button.disabled=false;}
});

$('#login-form').addEventListener('submit',async e=>{e.preventDefault();token=$('#access').value.trim();try{await load();message('Workspace loaded.')}catch(e){token='';message(e.message,true)}});
$('#logout').onclick=()=>{token='';data=null;selected=null;marketplaceJobs=[];$('#workspace').hidden=true;$('#signin').hidden=false;$('#leads').replaceChildren();$('#detail').replaceChildren();$('#requests').replaceChildren();message('Signed out.');};
$('#search').oninput=render;$('#stage').onchange=render;
$('#refresh').onclick=async()=>{try{await load();message('Inbox refreshed.')}catch(e){message(e.message,true)}};
document.addEventListener('click',e=>{const b=e.target.closest('[data-lead]');if(b){selected=b.dataset.lead;render();detail();$('#detail').scrollIntoView({behavior:'smooth',block:'nearest'})}});
document.addEventListener('submit',async e=>{const f=e.target;if(!['job-form','estimate-request'].includes(f.id)&&!f.dataset.review)return;e.preventDefault();const submit=e.submitter;submit.disabled=true;try{const values=Object.fromEntries(new FormData(f));if(f.id==='job-form')await api('/api/crm/leads/'+selected,values);else if(f.id==='estimate-request')await api('/api/crm/estimate-requests',{leadId:selected,...values});else{const decision=submit.value;if(decision==='approved'&&!confirm('Approve this draft? No estimate will be sent to your customer.'))return;await api('/api/crm/estimate-requests/'+f.dataset.review+'/decision',{...values,decision})}await load();message('Saved.')}catch(e){message(e.message,true)}finally{submit.disabled=false}});
const supplied=new URLSearchParams(location.hash.slice(1)).get('access');if(supplied){history.replaceState(null,'',location.pathname);$('#access').value=supplied;$('#login-form').requestSubmit()}
})();
