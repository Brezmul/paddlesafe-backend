import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'privacidad.html'],
      manifest: {
        id: 'paddlesafe-pwa',
        name: 'PaddleSafe — Seguridad y pronóstico SUP',
        short_name: 'PaddleSafe',
        description: 'Pronóstico marino, veredicto de seguridad, rutas, clubes y comunidad de paddle surf.',
        lang: 'es',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#041e30',
        theme_color: '#041e30',
        orientation: 'portrait',
        categories: ['sports', 'weather', 'navigation'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/([abc]\.tile\.openstreetmap\.org|.*basemaps\.cartocdn\.com)\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'paddlesafe-map-tiles',
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 14 }
            }
          },
          {
            urlPattern: /^https:\/\/(api\.open-meteo\.com|marine-api\.open-meteo\.com|geocoding-api\.open-meteo\.com)\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'paddlesafe-meteo',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 30 }
            }
          },
          {
            urlPattern: /^https:\/\/(api\.rainviewer\.com|.*rainviewer\.com)\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'paddlesafe-radar',
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 20 }
            }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    fs: { allow: [path.resolve(__dirname, '..')] }
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
});
