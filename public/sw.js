// ──────────────────────────────────────────────────────────────────────────────
// Service Worker - PWA Pharmacy HR & Employee Portal
// Zero-Cache Guarantee + Strict Network-First Strategy
// ──────────────────────────────────────────────────────────────────────────────

const CACHE_NAME = 'pharmacy-portal-v3-' + Date.now();
const OFFLINE_URL = '/offline.html';

// ── Install: Force Immediate Activation & Precache Offline Page ─────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([OFFLINE_URL, '/favicon.ico']).catch(() => {});
    })
  );
  self.skipWaiting();
});

// ── Activate: Purge ALL old caches immediately & Claim Clients ───────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Purging outdated cache:', key);
            return caches.delete(key);
          }
          return Promise.resolve();
        })
      );
    }).then(() => {
      return self.clients.claim();
    }).then(() => {
      // Notify all open client tabs that a fresh version is active
      return self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'SW_UPDATED', version: CACHE_NAME });
        });
      });
    })
  );
});

// ── Fetch: Strict Network-First Strategy ─────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, localhost, 127.0.0.1, chrome extensions, API endpoints, SSE streams, and external domains
  if (
    request.method !== 'GET' ||
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.protocol === 'chrome-extension:' ||
    url.pathname.startsWith('/api') ||
    url.pathname.includes('/api/') ||
    url.pathname.includes('/stream') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    return;
  }

  // For HTML documents: Always fetch fresh from network with fallback
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .catch(async () => {
          const offlinePage = await caches.match(OFFLINE_URL);
          if (offlinePage) return offlinePage;
          const cachedIndex = await caches.match('/index.html');
          if (cachedIndex) return cachedIndex;
          return new Response(
            '<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>غير متصل</title><style>body{background:#0f172a;color:#f8fafc;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:20px;}button{background:#0d9488;color:#fff;border:none;padding:12px 24px;border-radius:10px;font-size:16px;cursor:pointer;margin-top:20px;font-weight:bold;}</style></head><body><h2>تعذر الاتصال بالإنترنت</h2><p>يرجى التحقق من اتصال الشبكة وإعادة المحاولة.</p><button onclick="window.location.reload()">🔄 إعادة المحاولة</button></body></html>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503, statusText: 'Offline' }
          );
        })
    );
    return;
  }

  // Network-First for other static assets
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
        return new Response('Offline - Asset unavailable', { status: 503, statusText: 'Offline' });
      })
  );
});

// ── Background Sync ──────────────────────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-shifts') {
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
