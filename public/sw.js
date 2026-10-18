const CACHE='handi-guest-v3';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/','/policy','/icon.svg','/icon-192.png','/icon-512.png','/manifest.webmanifest'])));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));self.clients.claim();});
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||url.pathname.startsWith('/auth/')||url.pathname.startsWith('/share/')||event.request.headers.has('rsc'))return;
if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(async()=>await caches.match(url.pathname)??await caches.match('/')));return;}
if(url.pathname.startsWith('/_next/static/')||url.pathname.startsWith('/icon')){event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}return response;})));}});
