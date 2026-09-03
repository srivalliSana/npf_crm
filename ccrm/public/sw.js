const CACHE = 'ccrm-v3'
const STATIC = ['/','index.html']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()))
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)

  // Skip non-GET, non-same-origin, API, and uploads requests
  if (
    e.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/uploads')
  ) return

  // Cache static assets (but not API/uploads)
  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Only cache successful responses
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone))
        }
        return res
      })
      .catch(() => {
        // Fall back to cache if offline
        return caches.match(e.request) || new Response('Offline', { status: 503 })
      })
  )
})
