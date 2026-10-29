self.addEventListener('install',e=>e.waitUntil(caches.open('demo-v1').then(c=>c.addAll(['/','/sw.js']))));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>e.respondWith(fetch(e.request).catch(()=>caches.match(e.request))));
