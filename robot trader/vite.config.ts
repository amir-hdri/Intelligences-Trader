import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      output: {
        // The callback form is the portable one: Vite 8 bundles with Rolldown,
        // which rejects the object form, while Vite 7 accepts both.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('node_modules/recharts')) return 'charts'
          if (id.includes('node_modules/lucide-react')) return 'icons'
          if (
            id.includes('node_modules/sentiment') ||
            id.includes('node_modules/date-fns') ||
            id.includes('node_modules/jalaali-js')
          ) {
            return 'analytics'
          }
          return undefined
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api/orderbook': {
        target: process.env.VITE_MARKET_API_URL || 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/market': {
        target: process.env.VITE_MARKET_API_URL || 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: process.env.VITE_WS_PROXY_URL || 'ws://localhost:3001',
        changeOrigin: true,
        ws: true,
        rewrite: path => path.replace(/^\/ws/, '/'),
      },
    },
  },
})
