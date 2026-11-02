(()=>{'use strict';
const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const form=$('#document-form'),money=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>money.format(Number.isFinite(Number(v))?Number(v):0);
const round=v=>Math.round((v+Number.EPSILON)*100)/100;
let token='',records=[],currentId=null,loadedRecord=null;
const field=k=>form.elements.namedItem(k);
const val=k=>field(k)?.value??'';
const num=k=>Math.max(0,Number(val(k))||0);
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const dateText=s=>{if(!s)return '—';const x=new Date(s+'T12:00:00');return Number.isNaN(x.getTime())?s:x.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})};
const status=(s,error=false,id='#form-status')=>{const el=$(id);el.textContent=s;el.classList.toggle('error',error)};
async function request(method='GET',payload){
 const estimate=method==='POST'&&payload?.type==='estimate';
 const route=method==='GET'||estimate?'/api/command/estimates':'/api/admin/documents';
 if(estimate)payload={...payload,deposit:payload.payment};
 const response=await fetch(route,{method,headers:{'Content-Type':'application/json','X-Admin-Token':token},body:payload?JSON.stringify(payload):undefined,cache:'no-store'});
 const data=await response.json();if(!response.ok)throw Error(data.error||'Request failed');return data;
}
function showShare(doc){
 if(!doc?.approvalToken)return;
 const url=location.origin+'/quote.html?token='+encodeURIComponent(doc.approvalToken);
 $('#approval-link').value=url;$('#view-approval').href=url;$('#approval-note').textContent=doc.number+' · '+doc.client;
 $('#approval-share').hidden=false;$('#approval-share').scrollIntoView({behavior:'smooth',block:'start'});
}

function show(name){$('#editor-section').hidden=name!=='editor';$('#documents-section').hidden=name!=='documents';$('#customers-section').hidden=name!=='customers';if(name!=='home')$(({editor:'#editor-section',documents:'#documents-section',customers:'#customers-section'})[name])?.scrollIntoView({behavior:'smooth',block:'start'})}
function line(category='Labor',description='',qty=1,unit='ea',rate=0){
 const row=document.createElement('div');row.className='item-row';
 row.innerHTML='<div class="item-head"><b>LINE ITEM</b><button type="button" class="remove" aria-label="Remove line item">Remove ×</button></div><div class="item-fields"><label class="item-description">Description<input class="li-description" maxlength="250" placeholder="Work performed or material supplied" value="'+esc(description)+'"></label><label>Category<select class="li-category">'+['Labor','Materials','Other'].map(v=>'<option'+(v===category?' selected':'')+'>'+v+'</option>').join('')+'</select></label><label>Unit<select class="li-unit">'+['ea','hr','day','sq ft','lin ft','room','job','gal'].map(v=>'<option'+(v===unit?' selected':'')+'>'+v+'</option>').join('')+'</select></label><label>Qty<input class="li-qty" type="number" min="0.001" step="any" value="'+esc(qty)+'"></label><label>Unit rate ($)<input class="li-rate" type="number" min="0" step="0.01" value="'+esc(rate)+'"></label></div><div class="item-line-total">Amount: <span>$0.00</span></div>';
 row.querySelector('.remove').addEventListener('click',()=>{row.remove();refreshLineLabels();renderPreview()});
 $('#item-lines').appendChild(row);refreshLineLabels();return row;
}
function refreshLineLabels(){$$('.item-row').forEach((r,i)=>r.querySelector('.item-head b').textContent='ITEM '+String(i+1).padStart(2,'0'))}
function lineItems(){return $$('.item-row').map(row=>({description:row.querySelector('.li-description').value.trim(),category:row.querySelector('.li-category').value,unit:row.querySelector('.li-unit').value,qty:Number(row.querySelector('.li-qty').value)||0,rate:Number(row.querySelector('.li-rate').value)||0})).filter(item=>item.description||item.rate>0)}
function collect(){return {id:currentId,type:val('type'),number:val('number'),date:val('date'),dueDate:val('dueDate'),client:val('client').trim(),clientPhone:val('clientPhone'),clientEmail:val('clientEmail'),clientAddress:val('clientAddress'),project:val('project'),projectAddress:val('projectAddress'),scope:val('scope'),items:lineItems(),discount:num('discount'),taxRate:num('taxRate'),payment:num('payment'),markup:num('markup'),notes:val('notes'),terms:val('terms'),license:val('license'),status:val('status')}}
function calc(d){const subtotal=round(d.items.reduce((a,i)=>a+Math.max(0,Number(i.qty)||0)*Math.max(0,Number(i.rate)||0),0));const markup=Math.max(0,Number(d.markup)||0);const discount=Math.min(subtotal+markup,Math.max(0,Number(d.discount)||0));const taxable=Math.max(0,subtotal+markup-discount),tax=round(taxable*Math.min(100,Math.max(0,Number(d.taxRate)||0))/100);const total=round(taxable+tax);return {subtotal,markup,discount,tax,total,payment:Math.min(total,Math.max(0,Number(d.payment)||0)),balance:round(total-Math.min(total,Math.max(0,Number(d.payment)||0)))}}
function renderPreview(){
 const d=collect(),amount=calc(d),invoice=d.type==='invoice',title=invoice?'INVOICE':'ESTIMATE';
 $('#editor-title').textContent=(currentId?'Edit ':'New ')+(invoice?'Invoice':'Estimate');
 $('#due-label').textContent=invoice?'Payment due':'Valid until';
 $('#payment-label').textContent=invoice?'Amount already paid ($)':'Requested deposit ($)';
 $('#convert-document').hidden=true;$('#save-document').disabled=!!(loadedRecord&&((loadedRecord.type==='estimate'&&loadedRecord.status==='approved')||loadedRecord.sourceEstimateId));
 $$('.item-row').forEach(row=>{const q=Math.max(0,Number(row.querySelector('.li-qty').value)||0),r=Math.max(0,Number(row.querySelector('.li-rate').value)||0);row.querySelector('.item-line-total span').textContent=fmt(q*r)});
 const terms=d.terms|| (invoice?'Payment is due by the stated due date. Please reference the invoice number with your payment.':'Estimate subject to customer approval. Changes to scope may affect the final price.');
 const scope=d.scope?.trim()||'Scope of work will be described here.';
 const itemHtml=d.items.length?d.items.map(i=>'<tr><td><b>'+esc(i.description||'Unnamed item')+'</b><div class="item-category">'+esc(i.category)+'</div></td><td>'+esc(i.unit)+'</td><td>'+esc(i.qty)+'</td><td>'+fmt(i.rate)+'</td><td>'+fmt(i.qty*i.rate)+'</td></tr>').join(''):'<tr><td colspan="5" style="text-align:center;color:#71839a">Your itemized work appears here.</td></tr>';
 const markup=amount.markup?'<div class="total-row"><span>Markup</span><b>'+fmt(amount.markup)+'</b></div>':'';
 const discount=amount.discount?'<div class="total-row"><span>Discount</span><b>−'+fmt(amount.discount)+'</b></div>':'';
 const tax=amount.tax?'<div class="total-row"><span>Tax ('+esc(d.taxRate)+'%)</span><b>'+fmt(amount.tax)+'</b></div>':'';
 const paid=invoice?'<div class="total-row payment"><span>Payments received</span><b>−'+fmt(amount.payment)+'</b></div><div class="total-row grand"><span>Balance due</span><b>'+fmt(amount.balance)+'</b></div>':(amount.payment?'<div class="total-row payment"><span>Deposit requested</span><b>'+fmt(amount.payment)+'</b></div><div class="total-row"><span>Remaining after deposit</span><b>'+fmt(amount.balance)+'</b></div>':'');
 $('#print-area').innerHTML='<div class="invoice-header"><img src="/superior-logo.png" alt="Superior Maintenance and Remodeling original logo"><div><div class="doc-name">'+title+'</div><div class="doc-number">'+esc(d.number||'DRAFT')+'</div><div class="business-title">SUPERIOR MAINTENANCE AND REMODELING</div><div class="business-subtitle">Fontana, California · Inland Empire<br>909-352-3627'+(d.license?'<br>License: '+esc(d.license):'')+'</div></div></div>'+
 '<div class="doc-meta"><div><div class="meta-head">PREPARED FOR</div><strong>'+esc(d.client||'Customer Name')+'</strong><p>'+esc(d.clientAddress||'Billing address')+(d.clientPhone?'<br>'+esc(d.clientPhone):'')+(d.clientEmail?'<br>'+esc(d.clientEmail):'')+'</p></div><div><div class="meta-head">PROJECT</div><strong>'+esc(d.project||'Project description')+'</strong><p>'+esc(d.projectAddress||'Jobsite address')+'</p></div></div>'+
 '<div class="doc-dates"><div>DOCUMENT DATE<b>'+esc(dateText(d.date))+'</b></div><div>'+(invoice?'DUE DATE':'VALID UNTIL')+'<b>'+esc(dateText(d.dueDate))+'</b></div><div>STATUS<b>'+esc(d.status.toUpperCase())+'</b></div></div>'+
 '<div class="doc-scope"><b>Scope of Work</b>'+esc(scope)+'</div>'+
 '<table class="doc-items"><thead><tr><th>DESCRIPTION</th><th>UNIT</th><th>QTY</th><th>RATE</th><th>AMOUNT</th></tr></thead><tbody>'+itemHtml+'</tbody></table>'+
 '<div class="totals-wrap"><div class="totals"><div class="total-row"><span>Subtotal</span><b>'+fmt(amount.subtotal)+'</b></div>'+markup+discount+tax+'<div class="total-row grand"><span>'+ (invoice?'Invoice total':'Estimate total') +'</span><b>'+fmt(amount.total)+'</b></div>'+paid+'</div></div>'+
 '<div class="doc-foot"><strong>Terms & payment</strong>'+esc(terms)+(d.notes?'<strong>Notes & exclusions</strong>'+esc(d.notes):'')+'</div>'+
 (invoice?'':'<div class="signature"><span>Customer approval / signature</span><span>Date</span></div>')+
 '<div class="doc-footer"><span>Superior Maintenance and Remodeling</span><span>From an idea to a finished improvement.</span></div>';
}
function openNew(type){currentId=null;loadedRecord=null;$('#save-document').disabled=false;form.reset();field('type').value=type;field('date').value=today();field('status').value='draft';$('#item-lines').innerHTML='';line('Labor');line('Materials');status('');show('editor');renderPreview()}
function editRecord(id){const d=records.find(r=>r.id===id);if(!d)return;currentId=d.id;loadedRecord=d;form.reset();for(const [key,value]of Object.entries(d)){const el=field(key);if(el&&typeof value!=='object')el.value=value??''}$('#item-lines').innerHTML='';(d.items||[]).forEach(i=>line(i.category,i.description,i.qty,i.unit,i.rate));show('editor');status('Loaded '+d.number+'.');renderPreview()}
function convert(id){const d=records.find(r=>r.id===id);if(!d)return;editRecord(id);currentId=null;loadedRecord=null;field('type').value='invoice';field('number').value='';field('status').value='draft';field('payment').value='0';field('markup').value='0';field('date').value=today();field('dueDate').value='';status('Invoice draft created from '+d.number+'. Save it to assign a new invoice number.');renderPreview()}
function updateViews(){
 const es=records.filter(d=>d.type==='estimate'),ins=records.filter(d=>d.type==='invoice');
 $('#estimate-count').textContent=es.length;$('#invoice-count').textContent=ins.length;
 $('#balance-value').textContent=fmt(ins.reduce((sum,d)=>sum+(d.status==='paid'?0:Math.max(0,(d.total||calc(d).total)-(d.payment||0))),0));
 $('#document-list').innerHTML=records.length?records.map(d=>{const total=d.total??calc(d).total;return '<article class="record"><div><b>'+esc(d.number)+' · '+esc(d.client)+'</b><small>'+esc(d.project||'Project')+' · '+esc(dateText(d.date))+' · <span class="pill">'+esc(d.status)+'</span></small><small>'+esc(d.type.toUpperCase())+'</small></div><div><div class="money">'+fmt(total)+'</div><div class="record-actions"><button type="button" class="button secondary" data-edit="'+esc(d.id)+'">Open / Edit</button>'+(d.type==='estimate'&&d.approvalToken?'<button type="button" class="button primary" data-share="'+esc(d.id)+'">Approval Link</button>':d.type==='estimate'?'<button type="button" class="button primary" data-convert="'+esc(d.id)+'">Make Invoice</button>':'')+(d.type==='invoice'&&d.sourceEstimateId&&d.status==='unpaid'?'<button type="button" class="button primary" data-paid="'+esc(d.id)+'">Mark Paid</button>':'')+'</div></div></article>'}).join(''):'<p class="hint">No documents saved yet. Create your first estimate or invoice above.</p>';
 const customers=new Map();
 for(const d of records){const key=(d.clientEmail||d.clientPhone||d.client).trim().toLowerCase();if(!key)continue;if(!customers.has(key))customers.set(key,{name:d.client,email:d.clientEmail,phone:d.clientPhone,address:d.clientAddress,count:0});customers.get(key).count++;}
 $('#customer-list').innerHTML=customers.size?Array.from(customers.values()).map(c=>'<article class="record"><div><b>'+esc(c.name)+'</b><small>'+esc(c.phone||'No phone')+' · '+esc(c.email||'No email')+'</small><small>'+esc(c.address||'')+'</small></div><span class="pill">'+c.count+' document'+(c.count===1?'':'s')+'</span></article>').join(''):'<p class="hint">Customer contacts will appear after saving documents.</p>';
}
async function refresh(){const data=await request();records=data.documents||[];updateViews()}
$('#signin-button').addEventListener('click',async()=>{const t=$('#access-token').value.trim();if(!t)return status('Enter your owner token.',true,'#login-status');token=t;status('Checking access…',false,'#login-status');try{await refresh();$('#signin').hidden=true;$('#access-token').value='';$('#workspace').hidden=false;status('');}catch(e){token='';status('Owner access failed: '+e.message,true,'#login-status')}});
$('#access-token').addEventListener('keydown',e=>{if(e.key==='Enter')$('#signin-button').click()});
$$('[data-open]').forEach(el=>el.addEventListener('click',()=>{const mode=el.dataset.open;if(['estimate','invoice'].includes(mode))openNew(mode);else show(mode)}));
$('#close-editor').addEventListener('click',()=>show('home'));
$('#add-item').addEventListener('click',()=>{line();renderPreview()});
form.addEventListener('input',renderPreview);form.addEventListener('change',renderPreview);
form.addEventListener('submit',async e=>{e.preventDefault();const data=collect();if(!data.client||data.client.length<2)return status('Enter the customer name.',true);if(!data.items.length||data.items.some(i=>!i.description||i.qty<=0||i.rate<0))return status('Each item needs a description, positive quantity and rate.',true);status('Saving…');try{const out=await request('POST',data);currentId=out.document.id;loadedRecord=out.document;for(const [key,value]of Object.entries({number:out.document.number}))field(key).value=value;await refresh();field('status').value=out.document.status;renderPreview();status('Saved '+out.document.number+' successfully.');if(out.document.type==='estimate')showShare(out.document)}catch(e){status('Could not save: '+e.message,true)}});
$('#print-document').addEventListener('click',()=>{renderPreview();window.print()});
$('#convert-document').addEventListener('click',()=>{if(currentId)convert(currentId)});
$('#backup-button').addEventListener('click',()=>{if(!records.length)return alert('No saved documents to back up yet.');const payload={exportedAt:new Date().toISOString(),source:'Superior Command Center',documents:records};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='superior-command-center-backup-'+today()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)});
document.addEventListener('click',e=>{const edit=e.target.closest('[data-edit]'),conversion=e.target.closest('[data-convert]'),share=e.target.closest('[data-share]'),paid=e.target.closest('[data-paid]');if(edit)editRecord(edit.dataset.edit);if(conversion)convert(conversion.dataset.convert);if(share)showShare(records.find(r=>r.id===share.dataset.share));if(paid&&confirm('Mark invoice paid? Only do this after receiving payment.')){fetch('/api/command/estimates/'+encodeURIComponent(paid.dataset.paid)+'/paid',{method:'POST',headers:{'X-Admin-Token':token}}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||'Could not mark paid');await refresh()}).catch(err=>alert(err.message))}});
$('#copy-approval').addEventListener('click',async()=>{const a=$('#approval-link');try{await navigator.clipboard.writeText(a.value);status('Customer link copied. Send it to your customer.')}catch{a.select();document.execCommand('copy');status('Customer link selected. You can copy it now.')}});
$('#send-approval').addEventListener('click',async()=>{const url=$('#approval-link').value;if(!url)return;try{if(navigator.share)await navigator.share({title:'Superior Maintenance and Remodeling estimate',url,text:$('#approval-note').textContent});else{await navigator.clipboard.writeText(url);status('Link copied. Paste into your text or email.')}}catch{}});
})();
