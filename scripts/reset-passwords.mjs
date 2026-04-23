// Geçici şifre sıfırlama — herkes ilk girişten sonra kendi şifresini değiştirsin.
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'

if (existsSync('.env.local')) {
  readFileSync('.env.local', 'utf-8').split('\n').forEach((l) => {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/)
    if (m) process.env[m[1]] = m[2].trim()
  })
}

const admin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const YENI_SIFRE = 'ZnaCrm2026!'

const { data: kullanicilar } = await admin.from('kullanicilar').select('id, kullanici_adi, email, auth_id')

for (const k of kullanicilar) {
  if (!k.auth_id) { console.log(`⏭  ${k.kullanici_adi} (auth_id yok)`); continue }
  const { error } = await admin.auth.admin.updateUserById(k.auth_id, { password: YENI_SIFRE })
  if (error) console.log(`❌ ${k.kullanici_adi}: ${error.message}`)
  else console.log(`✅ ${k.kullanici_adi} → ${YENI_SIFRE}`)
}
