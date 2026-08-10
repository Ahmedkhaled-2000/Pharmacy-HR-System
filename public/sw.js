// ──────────────────────────────────────────────────────────────────────────────
// Service Worker - PWA Employee Portal
// ──────────────────────────────────────────────────────────────────────────────

const CACHE_NAME = 'pharmacy-employee-v1';
const OFFLINE_URL = '/offline.html';

// ملفات يتم تخزينها مؤقتًا عند أول تحميل
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html'
];

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching offline assets');
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// ── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, chrome-extension, supabase API, and non-same-origin
  if (
    request.method !== 'GET' ||
    url.protocol === 'chrome-extension:' ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    return;
  }

  // Network-first strategy for HTML navigation
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.open(CACHE_NAME).then((cache) => {
          return cache.match(OFFLINE_URL);
        });
      })
    );
    return;
  }

  // Cache-first strategy for static assets
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(request).then((networkResponse) => {
        // Cache successful responses for static assets
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      });
    }).catch(() => {
      // Return offline page for navigation
      if (request.destination === 'document') {
        return caches.match(OFFLINE_URL);
      }
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
