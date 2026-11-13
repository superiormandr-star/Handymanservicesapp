'use strict';
(() => {
 const el=id=>document.getElementById(id), status=el('onedrive-status');
 const token=()=>el('admintoken')?.value?.trim()||'';
 const request=async(path,options={})=>{
  const r=await fetch('/api/owner/onedrive/'+path,{...options,headers:{'X-Admin-Token':token(),...(options.headers||{})}});
  const data=await r.json();if(!r.ok)throw Error(data.error||'OneDrive request failed');return data;
 };
 async function refresh(){
  if(!token()){status.textContent='Enter your owner token above to check OneDrive.';return}
  try{const x=await request('status');status.textContent=x.connected?'OneDrive connected. Ready to save files.':'OneDrive is not connected yet.'}
  catch(e){status.textContent=e.message}
 }
 el('login')?.addEventListener('click',()=>setTimeout(refresh,200));
 el('onedrive-connect')?.addEventListener('click',async()=>{
  try{status.textContent='Preparing Microsoft sign-in…';const x=await request('connect');location.assign(x.authorizationUrl)}
  catch(e){status.textContent=e.message}
 });
 el('onedrive-upload')?.addEventListener('click',async()=>{
  try{status.textContent='Saving to OneDrive…';const x=await request('upload',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:el('onedrive-filename').value,content:el('onedrive-content').value})});status.textContent='Saved '+x.name+' to OneDrive.'}
  catch(e){status.textContent=e.message}
 });
 if(new URLSearchParams(location.search).get('onedrive')==='connected')status.textContent='Microsoft authorization completed. Enter your owner token to confirm.';
})();
