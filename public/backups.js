'use strict';
let token='';
const status=document.querySelector('#status');
async function api(route,method='GET',payload){
 const response=await fetch('/api/admin/backups'+route,{method,headers:{'x-admin-token':token,'content-type':'application/json'},body:payload?JSON.stringify(payload):undefined});
 if(!response.ok){const error=await response.json();throw Error(error.error||'Backup request failed.');}return response;
}
async function run(action){try{await action()}catch(error){status.textContent=error.message}}
async function refresh(){
 const info=await (await api('/status')).json();
 status.textContent=!info.configured?'Microsoft backup configuration is incomplete.':info.connected?'Microsoft account connected. Automatic backups '+(info.automaticBackups?'enabled.':'disabled.'):'Connect the owner Microsoft account to enable backups.';
 document.querySelector('#controls').hidden=false;
 document.querySelector('#backup').disabled=!info.connected;
 document.querySelector('#connect').disabled=!info.configured;
 const list=document.querySelector('#backups');list.replaceChildren();
 if(!info.connected)return;
 const result=await (await api('')).json();
 for(const item of result.backups){
  const row=document.createElement('li'),button=document.createElement('button');button.textContent='Download recovery';
  button.onclick=()=>run(async()=>{
   const blob=await (await api('/recover','POST',{id:item.id})).blob(),url=URL.createObjectURL(blob),link=document.createElement('a');
   link.href=url;link.download='superior-proconnect-recovery.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  row.append(document.createTextNode(item.name+' '),button);list.append(row);
 }
 if(result.hasMore)status.textContent+=' Showing the first 200 OneDrive items.';
}
document.querySelector('#access').onsubmit=event=>{event.preventDefault();token=document.querySelector('#token').value;document.querySelector('#token').value='';run(refresh)};
document.querySelector('#connect').onclick=()=>run(async()=>{const result=await (await api('/connect','POST',{accountType:document.querySelector('#account-type').value})).json();location.assign(result.authorizationUrl)});
document.querySelector('#backup').onclick=()=>run(async()=>{await api('','POST');await refresh();status.textContent='Backup uploaded to OneDrive.'});
document.querySelector('#refresh').onclick=()=>run(refresh);
