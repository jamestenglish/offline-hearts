/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'node:path';

export default defineConfig({
  base: '/offline-hearts/',
  build: {
    rollupOptions: {
      input: {
        hearts: resolve(import.meta.dirname, 'index.html'),
        poker: resolve(import.meta.dirname, 'offline-texas-holdem/index.html'),
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        name: 'Offline Hearts',
        short_name: 'Hearts',
        description: 'Pass-and-play Hearts for four players, works offline.',
        theme_color: '#0b5d2a',
        background_color: '#0b5d2a',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        navigateFallback: null,
      },
    }),
    {
      name: 'poker-own-manifest',
      enforce: 'post',
      transformIndexHtml: {
        order: 'post',
        handler(html, context) {
          if (!context.path.includes('/offline-texas-holdem/')) return html;
          return html
            .replace(/<link rel="manifest" href="\/offline-hearts\/manifest\.webmanifest">/g, '')
            .replace(/<script id="vite-plugin-pwa:register-sw"[^>]*><\/script>/g, '');
        },
      },
    },
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
