'use strict';
let token='';
const status=document.querySelector('#status');
const backupButton=document.querySelector('#backup');
const repairSection=document.querySelector('#folder-repair');
const accountType=document.querySelector('#account-type');
async function api(route,method='GET',payload){
 const response=await fetch('/api/admin/backups'+route,{method,headers:{'x-admin-token':token,'content-type':'application/json'},body:payload?JSON.stringify(payload):undefined});
 if(!response.ok){
  const error=await response.json().catch(()=>({}));
  throw Error(error.error||'Backup request failed ('+response.status+').');
 }
 return response;
}
async function run(action){try{await action()}catch(error){status.textContent=error.message}}
async function explainFolderFailure(info,failed){
 backupButton.disabled=true;
 repairSection.hidden=true;
 let diagnostic=null;
 try{diagnostic=await (await api('/diagnose')).json()}catch{}
 const checks=Array.isArray(diagnostic?.checks)?diagnostic.checks:[];
 const drive=checks.find(check=>check.resource==='drive');
 const appFolder=checks.find(check=>check.resource==='special/approot');
 if(drive?.status===404){
  status.textContent='Microsoft sign-in succeeded, but Microsoft cannot find this account’s OneDrive drive (404). Confirm that the same personal Microsoft account opens OneDrive on the web. No backup was uploaded.';
  return;
 }
 if(info.connectedAccountType==='personal' && info.permissionMode==='appFolder' && [403,404].includes(appFolder?.status)){
  status.textContent='Microsoft sign-in succeeded, but the restricted OneDrive Apps folder is inaccessible ('+appFolder.status+'). No backup was uploaded. You may authorize the alternative standard OneDrive folder below.';
  repairSection.hidden=false;
  return;
 }
 status.textContent='Microsoft is connected, but retrieving backups failed: '+failed.message+' No backup was uploaded. The backup controls remain disabled until the folder is accessible.';
}
async function refresh(){
 const info=await (await api('/status')).json();
 status.textContent=!info.configured?'Microsoft backup configuration is incomplete.':info.connected?'Microsoft account connected. Automatic backups '+(info.automaticBackups?'enabled.':'disabled.'):'Connect the owner Microsoft account to enable backups.';
 document.querySelector('#controls').hidden=false;
 backupButton.disabled=true;
 repairSection.hidden=true;
 document.querySelector('#connect').disabled=!info.configured;
 if(info.connectedAccountType)accountType.value=info.connectedAccountType;
 status.textContent+=info.lastVerifiedBackup?' Last verified upload and download: '+info.lastVerifiedBackup.createdAt+'.':' No verified record backup has been recorded.';
 const list=document.querySelector('#backups');list.replaceChildren();
 if(!info.connected)return;
 let result;
 try{result=await (await api('')).json()}catch(error){await explainFolderFailure(info,error);return;}
 backupButton.disabled=false;
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
document.querySelector('#connect').onclick=()=>run(async()=>{const result=await (await api('/connect','POST',{accountType:accountType.value})).json();location.assign(result.authorizationUrl)});
document.querySelector('#connect-standard').onclick=()=>run(async()=>{
 // This action is only available after the owner explicitly chooses broader Microsoft file access.
 const result=await (await api('/connect','POST',{accountType:'personal',permissionMode:'files'})).json();
 location.assign(result.authorizationUrl);
});
document.querySelector('#backup').onclick=()=>run(async()=>{backupButton.disabled=true;try{await api('','POST');await refresh();status.textContent='Encrypted record backup uploaded, downloaded and checksum verified.';}catch(error){await refresh().catch(()=>{});throw error;}});
document.querySelector('#refresh').onclick=()=>run(refresh);
