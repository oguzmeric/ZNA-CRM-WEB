import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: Number(process.env.PORT) || 3000,
    strictPort: false,
    proxy: {
      '/api/tcmb': {
        target: 'https://www.tcmb.gov.tr',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/tcmb/, '/kurlar'),
      },
      '/api/doviz': {
        target: 'https://api.frankfurter.dev',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/doviz/, '/v1'),
      },
    },
  },
})