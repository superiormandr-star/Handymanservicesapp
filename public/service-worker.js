const CACHE='proconnect-v15-private-workspaces';
const ASSETS=['/','/index.html','/styles.css','/app.js','/logos/Superior_ProConnect_Master.jpg',
 '/logos/Superior_Construction_Network.jpg','/logos/Superior_Automotive_Network.jpg','/subscription-plans.json',
 '/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png','/icons/apple-touch-icon.png',
 '/icons/icon-192.png?v=approved-20261116','/icons/icon-512.png?v=approved-20261116',
 '/icons/apple-touch-icon.png?v=approved-20261116','/terms.html','/privacy.html','/standards.html'];
self.addEventListener('install',event=>{
 // A stale host missing a policy page can keep serving the existing worker.
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
 self.skipWaiting();
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys
  .filter(key=>key.startsWith('proconnect-')&&key!==CACHE).map(key=>caches.delete(key)))));
 self.clients.claim();
});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||!ASSETS.includes(url.pathname+url.search))return;
 event.respondWith(fetch(request).then(response=>{
  if(response.ok){
   const copy=response.clone();
   void caches.open(CACHE).then(cache=>cache.put(request,copy)).catch(()=>{});
  }
  return response;
 }).catch(()=>caches.match(request)));
});
