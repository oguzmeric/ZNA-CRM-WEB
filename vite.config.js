import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // ⚠️ 21.08 — PAYLAŞILAN ÇEKİRDEK TEK KOPYA OLMALI. Varsayılan bölme,
        // lib/cache.js + servisleri birden çok lazy chunk'a KOPYALIYORDU:
        // her kopyanın ayrı cache store'u oluşuyor, dedup/SWR çalışmıyor,
        // aynı listeler sayfa başına yeniden iniyordu (kullanicilar 137 KB ×3
        // ölçümü; ısıtma da işe yaramıyordu — başka kopyanın cache'ine yazıyordu).
        manualChunks(id) {
          const yol = id.replace(/\\/g, '/')
          if (yol.includes('/src/lib/') || yol.includes('/src/services/') || yol.includes('/src/context/')) return 'cekirdek'
        },
      },
    },
  },
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