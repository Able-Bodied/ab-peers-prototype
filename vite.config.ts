import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { configDefaults, defineConfig } from 'vitest/config';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'PeerConnect',
        short_name: 'PeerConnect',
        description: 'A community of peers with disabilities.',
        theme_color: '#1c3a30',
        background_color: '#f4f1e6',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    // Lets an ngrok tunnel reach the dev server — Vite otherwise rejects
    // requests whose Host header it doesn't recognize.
    allowedHosts: ['.ngrok-free.app', '.ngrok.app', '.ngrok.io'],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    // Parallel work-in-progress branches live as sibling git worktrees under .claude/worktrees —
    // without this, `pnpm test` from the repo root also collects (and runs) their test files,
    // including whatever half-finished state they're in.
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
});
