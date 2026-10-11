import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  base: './',
  plugins: [react(), {
    name: 'development-csp',
    apply: 'serve',
    transformIndexHtml: {
      order: 'pre',
      handler: html => html
        .replace("script-src 'self';", "script-src 'self' 'nonce-squidware-dev';")
        .replace("connect-src 'none';", "connect-src 'self' ws://127.0.0.1:5173 ws://localhost:5173;"),
    },
  }],
  // Vite's React refresh preamble is an inline module. Authorize only its
  // nonce in development; production HTML and the desktop CSP stay strict.
  html: command === 'serve' ? { cspNonce: 'squidware-dev' } : undefined,
  server: { port: 5173, strictPort: true },
  build: { rollupOptions: { output: { manualChunks: { three: ['three'], react: ['react', 'react-dom', 'react-dom/client'] } } } },
}));
