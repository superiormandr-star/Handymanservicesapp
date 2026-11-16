(()=>{'use strict';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let adminToken='';
const status=s=>$('#job-admin-status').textContent=s;
const fmt=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n)||0);
async function api(route,method='GET',data){
 const response=await fetch(route,{method,cache:'no-store',headers:{'Content-Type':'application/json','X-Admin-Token':adminToken},body:data?JSON.stringify(data):undefined});
 const out=await response.json();if(!response.ok)throw Error(out.error||'Request failed.');
 return out;
}
async function refreshJobs(){
 if(!adminToken)return;
 const result=await api('/api/admin/jobs');
 const select=$('#job-entitlement-profile');
 const previous=select.value;select.replaceChildren();
 for(const p of result.profiles||[])select.add(new Option(p.name+' · '+p.city,p.id));
 if((result.profiles||[]).some(p=>p.id===previous))select.value=previous;
 const entitlements=new Map((result.entitlements||[]).map(e=>[e.profileId,e]));
 const jobs=result.jobs||[];
 const list=$('#job-admin-list');
 if(!jobs.length){list.innerHTML='<p>No customer-posted jobs yet.</p>';status('Customer job list loaded.');return;}
 list.innerHTML=jobs.map(job=>{
  const customer=job.customer||{};
  const bids=(job.bids||[]).map(b=>{
   const waiting=b.status==='pending';
   const ref=b.paymentReference||'No receipt reference submitted';
   return '<article class="job-admin-bid"><strong>'+esc(b.professional)+'</strong> · '+fmt(b.amount)+
    ' · <span class="pill">'+esc(b.status)+'</span><p class="pre">'+esc(b.scope)+'</p>'+
    '<p class="muted">Payment: '+(b.creditUsed?'Included verified membership credit':fmt(b.fee)+' one-time fee')+
    ' · PayPal reference: '+esc(ref)+'</p>'+
    (waiting&&b.paymentReference?'<button type="button" class="btn btn-primary" data-verify-job="'+esc(job.id)+
    '" data-verify-bid="'+esc(b.id)+'">Verified in PayPal · release bid</button>':'')+
    (waiting?'<button type="button" class="btn btn-navy" data-reject-job="'+esc(job.id)+
    '" data-reject-bid="'+esc(b.id)+'">Reject bid</button>':'')+'</article>';
  }).join('');
  return '<article class="job-admin-card"><p><span class="pill">'+esc(job.industry)+'</span> · '+
   esc(job.status)+' · '+esc(job.filledSlots)+' / '+esc(job.bidLimit)+' active slots</p>'+
   '<h3>'+esc(job.title)+'</h3><p class="pre">'+esc(job.description)+'</p>'+
   '<p><strong>General area:</strong> '+esc(job.city)+'</p>'+
   '<details><summary>Private customer contact (owner only)</summary><p>'+
   esc(customer.name)+' · '+esc(customer.email||'')+' · '+esc(customer.phone||'')+
   '</p><p>'+esc(customer.address||'No exact address provided')+'</p></details>'+
   '<h4>Estimate submissions</h4>'+(bids||'<p>No bids submitted for this job.</p>')+'</article>';
 }).join('');
 status('Loaded '+jobs.length+' customer job(s). All paid estimates require independent PayPal verification.');
}
document.addEventListener('owner-workspace',event=>{
 adminToken=event.detail?.token||'';
 if(adminToken)refreshJobs().catch(err=>status(err.message));
});
$('#job-admin-refresh').addEventListener('click',()=>refreshJobs().catch(err=>status(err.message)));
$('#job-entitlement-form').addEventListener('submit',async event=>{
 event.preventDefault();
 const form=event.currentTarget,button=form.querySelector('[type=submit]');
 if(!$('#job-entitlement-confirm').checked){status('Confirm the PayPal subscription before issuing estimate credits.');return}
 const profileId=$('#job-entitlement-profile').value,tier=$('#job-entitlement-tier').value;
 if(!profileId)return status('Select a listed professional first.');
 if(!confirm('Verify this '+tier+' membership for the current month? This grants included estimate credits to the selected professional. Confirm payment status in PayPal first.'))return;
 button.disabled=true;
 try{
  const result=await api('/api/admin/jobs/entitlements','POST',{profileId,tier,confirmedInPayPal:true});
  $('#job-entitlement-confirm').checked=false;await refreshJobs();status(result.message);
 }catch(err){status(err.message)}finally{button.disabled=false}
});
$('#job-admin-list').addEventListener('click',async event=>{
 const yes=event.target.closest('[data-verify-bid]'),no=event.target.closest('[data-reject-bid]');
 const item=yes||no;if(!item)return;
 const approve=Boolean(yes);
 if(!confirm(approve?'Have you independently verified this exact payment transaction and amount in PayPal? Release the estimate to the customer?':'Reject this estimate? It will not reach the customer. Handle any refunds separately.'))return;
 item.disabled=true;
 const jobId=approve?item.dataset.verifyJob:item.dataset.rejectJob;
 const bidId=approve?item.dataset.verifyBid:item.dataset.rejectBid;
 try{
  const out=await api('/api/admin/jobs/'+jobId+'/bids/'+bidId+'/'+(approve?'verify':'reject'),'POST',approve?{confirmedInPayPal:true}:{});
  await refreshJobs();status(out.message);
 }catch(err){status(err.message);item.disabled=false}
});
})();