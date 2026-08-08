import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  define: { 'process.env.VITE_API_KEY': JSON.stringify(process.env.VITE_API_KEY || '') },
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ['recharts'],
          icons: ['lucide-react'],
          analytics: ['sentiment', 'date-fns', 'jalaali-js'],
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
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
