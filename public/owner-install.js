'use strict';
let deferred=null;
const button=document.getElementById('install-owner'), status=document.getElementById('install-status');
const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
if(standalone())button.hidden=true;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferred=event;button.hidden=false;});
window.addEventListener('appinstalled',()=>{deferred=null;button.hidden=true;status.textContent='Command Center installed.'});
button.addEventListener('click',async()=>{if(standalone()){button.hidden=true;return}if(deferred){const prompt=deferred;deferred=null;try{await prompt.prompt();const result=await prompt.userChoice;status.textContent=result.outcome==='accepted'?'Installation accepted.':'Installation dismissed.'}catch{status.textContent='Open your browser menu and choose Add to Home screen or Install app.'}}else{status.textContent='In Chrome, open the three-dot menu and choose Install app or Add to Home screen. On iPhone, use Safari Share, then Add to Home Screen.'}});
if('serviceWorker' in navigator)navigator.serviceWorker.register('/service-worker.js',{scope:'/'}).catch(()=>{status.textContent='App installation is unavailable in this browser. You can still bookmark this page.'});
