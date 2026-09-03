// Service worker disabled - causes rendering issues
// All requests pass through normally to the network
self.addEventListener('install', e => e.skipWaiting())
self.addEventListener('activate', e => e.respondWith(self.clients.matchAll().then(clients => clients.forEach(c => c.navigate(c.url)))))
