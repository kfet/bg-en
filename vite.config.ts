import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,xml}'],
        runtimeCaching: [
          {
            urlPattern: /\/data\/(bg-en|en-bg)\.json$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'dict-data-v1',
              expiration: {
                maxEntries: 2,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days max age
              },
            },
          },
        ],
      },
      manifest: {
        name: 'BG–EN Dictionary',
        short_name: 'БГ–АН',
        description: 'Offline Bulgarian–English / English–Bulgarian dictionary',
        lang: 'bg',
        theme_color: '#1565c0',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/bg-en/',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
})
