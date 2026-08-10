import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.svg', 'offline.html'],
      manifest: {
        name: 'بوابة موظفي الصيدلية',
        short_name: 'بوابة الموظف',
        description: 'تطبيق تتبع الحضور والانصراف لموظفي الصيدلية',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f172a',
        theme_color: '#3b82f6',
        lang: 'ar',
        dir: 'rtl',
        icons: [
          {
            src: '/icons/icon-72x72.svg',
            sizes: '72x72',
            type: 'image/svg+xml',
            purpose: 'maskable any'
          },
          {
            src: '/icons/icon-96x96.svg',
            sizes: '96x96',
            type: 'image/svg+xml',
            purpose: 'maskable any'
          },
          {
            src: '/icons/icon-128x128.svg',
            sizes: '128x128',
            type: 'image/svg+xml',
            purpose: 'maskable any'
          },
          {
            src: '/icons/icon-144x144.svg',
            sizes: '144x144',
            type: 'image/svg+xml',
            purpose: 'maskable any'
          },
          {
            src: '/icons/icon-152x152.svg',
            sizes: '152x152',
            type: 'image/svg+xml',
            purpose: 'maskable any'
          },
          {
            src: '/icons/icon-192x192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'maskable any'
          },
          {
            src: '/icons/icon-384x384.svg',
            sizes: '384x384',
            type: 'image/svg+xml',
            purpose: 'maskable any'
          },
          {
            src: '/icons/icon-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'maskable any'
          }
        ],
        permissions: ['geolocation', 'storage'],
        prefer_related_applications: false
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        globPatterns: [], // Disable precaching entirely so it never serves old cached files
        runtimeCaching: [
          {
            urlPattern: ({ request }) => true, // Match all requests
            handler: 'NetworkFirst', // Always fetch from network first, fallback to cache if offline
            options: {
              cacheName: 'app-network-first-cache',
              expiration: { maxEntries: 200, maxAgeSeconds: 24 * 60 * 60 } // Cache for 1 day max
            }
          }
        ]
      },
      devOptions: {
        enabled: true
      }
    })
  ],
  build: {
    cssMinify: false
  }
});
