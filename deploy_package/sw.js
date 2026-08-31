// ──────────────────────────────────────────────────────────────────────────────
// Service Worker - PWA Employee Portal
// ──────────────────────────────────────────────────────────────────────────────

const CACHE_NAME = 'pharmacy-portal-v2-' + Date.now();
const OFFLINE_URL = '/offline.html';

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// ── Activate: Purge ALL old caches immediately ──────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          console.log('[SW] Deleting obsolete cache:', key);
          return caches.delete(key);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// ── Fetch: Strict Network-First Strategy ─────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, chrome-extension, API endpoints, SSE streams, and external metrics
  if (
    request.method !== 'GET' ||
    url.protocol === 'chrome-extension:' ||
    url.pathname.startsWith('/api') ||
    url.pathname.includes('/api/') ||
    url.pathname.includes('/stream') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    return;
  }

  // Network-First: Always fetch fresh from network, fallback to cache/offline only when completely offline
  event.respondWith(
    fetch(request, { cache: 'no-cache' })
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && request.method === 'GET') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
          return cachedResponse;
        }
        if (request.mode === 'navigate' || request.destination === 'document') {
          const offlinePage = await caches.match(OFFLINE_URL);
          if (offlinePage) return offlinePage;
        }
        return new Response('Offline - No connection', { status: 503, statusText: 'Offline' });
      })
  );
});

// ── Background Sync (for shift punch when offline) ───────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-shifts') {
    console.log('[SW] Syncing offline shifts...');
    event.waitUntil(syncOfflineShifts());
  }
});

async function syncOfflineShifts() {
  try {
    const cache = await caches.open('offline-shifts');
    const keys = await cache.keys();
    for (const key of keys) {
      const response = await cache.match(key);
      const shift = await response.json();
      console.log('[SW] Syncing shift:', shift);
      // Data is synced when app reopens with network access
    }
  } catch (e) {
    console.error('[SW] Sync failed:', e);
  }
}

// ── Push Notifications ────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { title: 'إشعار', body: 'لديك إشعار جديد' };
  event.waitUntil(
    self.registration.showNotification(data.title || 'بوابة الموظف', {
      body: data.body || '',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      dir: 'rtl',
      lang: 'ar',
      vibrate: [200, 100, 200],
    })
  );
});
