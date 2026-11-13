// Deploys only the separate ProConnect ciphertext storage service on a free account.
import {readFile} from 'node:fs/promises';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!/^[a-f0-9]{32}$/i.test(account||'')||!token)throw Error('Cloudflare authorization is unavailable.');
const root='https://api.cloudflare.com/client/v4/accounts/'+account;
async function api(path,options={},allow404=false){
 const response=await fetch(root+path,{...options,headers:{Authorization:'Bearer '+token,...options.headers},signal:AbortSignal.timeout(30000)});
 if(allow404&&response.status===404)return null;
 const value=await response.json();if(!response.ok||!value.success)throw Error('Cloudflare request failed ('+response.status+') at '+path+'. No credentials or record values are included in this error.');return value.result;
}
const subscriptions=await api('/subscriptions');
if(subscriptions.length)throw Error('Account subscriptions exist. Stop for cost review; no resource will be created.');
const name='superior-proconnect-storage',marker='superior-proconnect-private-storage';
const settings=await api('/workers/scripts/'+name+'/settings',{},true);
if(settings&&!settings.tags?.includes(marker))throw Error('A same-named Worker already exists without the ProConnect ownership tag. It has not been overwritten.');
const databases=await api('/d1/database');
let database=databases.find(d=>d.name==='superior-proconnect-data');
if(!database)database=await api('/d1/database',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'superior-proconnect-data',primary_location_hint:'enam'})});
await api('/d1/database/'+database.uuid+'/query',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sql:await readFile(new URL('../storage-schema.sql',import.meta.url),'utf8')})});
const metadata={main_module:'storage-worker.mjs',compatibility_date:'2026-11-13',tags:[marker],bindings:[{name:'DB',type:'d1',id:database.uuid},{name:'STORAGE_PUBLIC_KEY',type:'plain_text',text:(await readFile(new URL('../storage-public-key.txt',import.meta.url),'utf8')).trim()}]};
const form=new FormData();form.set('metadata',JSON.stringify(metadata));form.set('storage-worker.mjs',new Blob([await readFile(new URL('../storage-worker.mjs',import.meta.url),'utf8')],{type:'application/javascript+module'}),'storage-worker.mjs');
await api('/workers/scripts/'+name,{method:'PUT',body:form});
await api('/workers/scripts/'+name+'/subdomain',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({enabled:true,previews_enabled:false})});
const domain=await api('/workers/subdomain');
console.log(JSON.stringify({databaseId:database.uuid,storageURL:'https://'+name+'.'+domain.subdomain+'.workers.dev',existingApplicationsChanged:false,newSubscription:false}));
