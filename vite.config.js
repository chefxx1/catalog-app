import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Accept connections from LAN / tunnel hosts (Cloudflare Tunnel, ngrok, etc.)
    host: true,
    // Allow any host header so cloudflare's *.trycloudflare.com domains work
    allowedHosts: true,
    // Forward /api/* to the Express backend so the frontend can use a single
    // origin (works through Cloudflare Tunnel / ngrok without a second tunnel).
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})

