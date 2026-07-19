// mig 199 gerçek-JWT E2E testi: Ahmet'in açtığı, Oğuz'a atanan throwaway görevi
// Oğuz'un GERÇEK oturumuyla tamamla → trigger Ahmet'e bildirim üretmeli.
// Kullanım: SRK=<service_role_key> node scripts/gorev-bildirim-e2e.mjs
import { createClient } from '@supabase/supabase-js'

const URL = 'https://hcrbwxeuscfibgmchdtt.supabase.co'
const SRK = process.env.SRK
if (!SRK) { console.error('SRK yok'); process.exit(1) }

const admin = createClient(URL, SRK)

// 1) Throwaway görev: oluşturan Ahmet (29), atanan Oğuz (2)
const { data: gorev, error: gErr } = await admin.from('gorevler').insert({
  baslik: 'TEST-199 e2e — silinecek', olusturan_ad: 'AHMET AGUN', olusturan_id: 29,
  atanan_id: 2, atanan: '2', atanan_ad: 'OĞUZ MERİÇ',
  son_tarih: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10),
  kabul_durumu: 'kabul_edildi', durum: 'devam',
}).select('id, gorev_no').single()
if (gErr) { console.error('görev açılamadı:', gErr.message); process.exit(1) }

// 2) Oğuz'un GERÇEK oturumu (magic link → verifyOtp)
const { data: ml, error: mlErr } = await admin.auth.admin.generateLink({
  type: 'magiclink', email: 'oguzmeric@zna.local',
})
if (mlErr) { console.error(mlErr.message); process.exit(1) }
const oguz = createClient(URL, SRK.split('.').length === 3 ? process.env.ANON || SRK : SRK, { auth: { persistSession: false } })
const { data: v, error: vErr } = await oguz.auth.verifyOtp({ token_hash: ml.properties.hashed_token, type: 'email' })
if (vErr) { console.error('oturum:', vErr.message); process.exit(1) }
await oguz.auth.setSession({ access_token: v.session.access_token, refresh_token: v.session.refresh_token })

// 3) Gerçek JWT ile tamamla
const { data: upd, error: uErr } = await oguz.from('gorevler')
  .update({ durum: 'tamamlandi', ilerleme: 100 }).eq('id', gorev.id).select('id, durum')
console.log('UPDATE:', uErr ? 'HATA ' + uErr.message : `${upd?.length} satır, durum=${upd?.[0]?.durum}`)

// 4) Ahmet'e bildirim düştü mü?
await new Promise(r => setTimeout(r, 800))
const { data: bil } = await admin.from('bildirimler')
  .select('id, alici_id, baslik, mesaj').eq('link', `/gorevler/${gorev.id}`)
console.log('BİLDİRİMLER:', JSON.stringify(bil, null, 1))

// 5) Temizlik: test bildirimi + görev
if (bil?.length) await admin.from('bildirimler').delete().in('id', bil.map(b => b.id))
await admin.from('gorevler').delete().eq('id', gorev.id)
console.log('TEMİZLENDİ. SONUÇ:', (bil?.some(b => b.alici_id === 29 && b.baslik.includes('✅'))) ? 'GEÇTİ ✅' : 'BAŞARISIZ ❌')
