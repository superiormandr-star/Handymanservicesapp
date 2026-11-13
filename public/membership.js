'use strict';
const status=document.querySelector('#payment-status'),button=document.querySelector('#verify-payment');
async function verify(){
 button.disabled=true;
 try{
  if(new URLSearchParams(location.search).has('canceled')){status.textContent='Checkout was canceled. No membership has been activated.';return;}
  const session=JSON.parse(sessionStorage.getItem('proconnect-checkout')||'null');
  if(!session){status.textContent='Open this page in the same browser tab where you applied. Contact the owner if you need help verifying an existing payment.';return;}
  const response=await fetch('/api/paypal/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(session)});
  const value=await response.json();if(!response.ok)throw Error(value.error||'Verification unavailable.');
  status.textContent=value.message;button.hidden=value.verified;
 }catch{status.textContent='Payment could not be verified right now. Keep your PayPal receipt; no paid privileges have been activated by this page.';button.hidden=false;}
 finally{button.disabled=false;}
}
button.onclick=verify;verify();
