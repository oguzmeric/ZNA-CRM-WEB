import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'

if (existsSync('.env.local')) {
  readFileSync('.env.local', 'utf-8').split('\n').forEach((l) => {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/)
    if (m) process.env[m[1]] = m[2].trim()
  })
}

const URL = process.env.VITE_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

// Önce admin'le auth.users listesini kontrol et
const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })
const { data: { users } } = await admin.auth.admin.listUsers()
console.log('\n=== Supabase Auth kullanıcıları ===')
users.forEach(u => console.log(`  ${u.email.padEnd(30)} | confirmed: ${!!u.email_confirmed_at} | created: ${u.created_at}`))

// Kullanıcı profilleri
const { data: profiller } = await admin.from('kullanicilar').select('id, kullanici_adi, email, auth_id, rol')
console.log('\n=== kullanicilar tablosu ===')
profiller.forEach(p => console.log(`  ${p.kullanici_adi.padEnd(20)} | email: ${p.email || 'NULL'} | auth_id: ${p.auth_id ? '✓' : '✗'} | rol: ${p.rol}`))

// Anon client'la gerçek login denemesi
const ANON = readFileSync('../../.env', 'utf-8').match(/VITE_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim()
  || readFileSync('.env', 'utf-8').match(/VITE_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim()

if (!ANON) {
  console.log('\n⚠️  Anon key bulunamadı, login testi atlandı')
  process.exit(0)
}

const client = createClient(URL, ANON)
console.log('\n=== Login testi (oguzmeric / ZnaCrm2026!) ===')
const { data, error } = await client.auth.signInWithPassword({
  email: 'oguzmeric@zna.local',
  password: 'ZnaCrm2026!',
})
if (error) console.log(`❌ HATA: ${error.message}`)
else console.log(`✅ OK — session: ${!!data.session}, user_id: ${data.user.id}`)
