// Şifresiz test girişi: service key ile magic link üretir ve token'ı doğrulayıp
// OTURUM JSON'u basar (tarayıcıya localStorage enjeksiyonu için).
// Kullanım: SRK=<service_role_key> node scripts/magic-link.mjs <email>
import { createClient } from '@supabase/supabase-js'

const URL = 'https://hcrbwxeuscfibgmchdtt.supabase.co'
const key = process.env.SRK
if (!key) { console.error('SRK env değişkeni yok'); process.exit(1) }

const admin = createClient(URL, key)
const { data, error } = await admin.auth.admin.generateLink({
  type: 'magiclink',
  email: process.argv[2],
})
if (error) { console.error('HATA:', error.message); process.exit(1) }

// Anon istemciyle token_hash'i doğrula → gerçek oturum
const anon = createClient(URL, process.env.ANON || key, { auth: { persistSession: false } })
const { data: v, error: e2 } = await anon.auth.verifyOtp({
  token_hash: data.properties.hashed_token,
  type: 'email',
})
if (e2) { console.error('VERIFY HATA:', e2.message); process.exit(1) }
console.log(JSON.stringify(v.session))
