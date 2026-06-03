// Karne service worker — makes the app installable to the home screen and keeps
// it usable when offline. Strategy: network-first (always fetch fresh so there's
// never a stale version), falling back to the cached copy only when offline.
const CACHE = 'karne-shell-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  // Don't touch Supabase / API calls — always live.
  if (!req.url.startsWith(self.location.origin)) return

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {})
        return res
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./'))),
  )
})
