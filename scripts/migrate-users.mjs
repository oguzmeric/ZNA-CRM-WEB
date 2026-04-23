// =====================================================================
// migrate-users.mjs — Mevcut kullanicilar tablosundan Supabase Auth'a göç
// =====================================================================
// Kullanım:
//   1. SERVICE_ROLE_KEY gerekir (Supabase Dashboard → Settings → API)
//      Bu key anon key DEĞİL, daha yüksek yetki — repo'ya commit'leme!
//
//   2. .env.local dosyası oluştur:
//      VITE_SUPABASE_URL=https://xxx.supabase.co
//      SUPABASE_SERVICE_ROLE_KEY=eyJ...
//
//   3. 001_auth_migration.sql BÖLÜM A'sını çalıştırmış olmalısın
//      (auth_id, rol, email kolonları eklenmiş olmalı)
//
//   4. Çalıştır:
//      node scripts/migrate-users.mjs --dry-run     (önizleme)
//      node scripts/migrate-users.mjs --execute     (gerçek migration)
//
// Ne yapar:
//   - kullanicilar tablosundaki her satır için Supabase Auth'ta
//     <kullanici_adi>@zna.local emailiyle yeni kullanıcı yaratır
//   - Rastgele güçlü bir şifre oluşturur
//   - kullanicilar.auth_id ve kullanicilar.email'i günceller
//   - Sonuçları migrated-users.csv'ye yazar (eski/yeni şifreler)
//
// GÜVENLİK: migrated-users.csv plaintext şifre içerir.
//           Kullanıcılara ilettikten SONRA dosyayı sil.
// =====================================================================

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

// .env.local oku
const envPath = '.env.local'
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8')
  envContent.split('\n').forEach((line) => {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/)
    if (match) process.env[match[1]] = match[2].trim()
  })
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ VITE_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli.')
  console.error('   .env.local dosyasına ekle.')
  process.exit(1)
}

const mode = process.argv[2]
if (!['--dry-run', '--execute'].includes(mode)) {
  console.error('Kullanım: node scripts/migrate-users.mjs [--dry-run|--execute]')
  process.exit(1)
}

const dryRun = mode === '--dry-run'
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const guvenliSifreUret = () => {
  const kucuk = 'abcdefghijkmnpqrstuvwxyz'
  const buyuk = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const rakam = '23456789'
  const sembol = '!@#$%&*'
  const tum = kucuk + buyuk + rakam + sembol
  const bytes = randomBytes(16)
  let pw = ''
  pw += kucuk[bytes[0] % kucuk.length]
  pw += buyuk[bytes[1] % buyuk.length]
  pw += rakam[bytes[2] % rakam.length]
  pw += sembol[bytes[3] % sembol.length]
  for (let i = 4; i < 14; i++) pw += tum[bytes[i] % tum.length]
  return pw
}

const main = async () => {
  console.log(`\n${dryRun ? '🔍 DRY RUN' : '⚡ EXECUTE'} — kullanıcı göçü başlıyor...\n`)

  const { data: kullanicilar, error } = await admin
    .from('kullanicilar')
    .select('id, kullanici_adi, ad, tip, auth_id, email, sifre')
    .order('id')

  if (error) {
    console.error('❌ kullanicilar okunamadı:', error.message)
    process.exit(1)
  }

  console.log(`📋 Toplam ${kullanicilar.length} kullanıcı bulundu.\n`)

  const sonuclar = []
  let basarili = 0
  let atlanan = 0
  let hatali = 0

  for (const k of kullanicilar) {
    if (k.auth_id) {
      console.log(`⏭  ${k.kullanici_adi.padEnd(20)} → zaten migre edilmiş (auth_id dolu), atlanıyor`)
      atlanan++
      continue
    }

    const email = `${k.kullanici_adi.toLowerCase().replace(/[^a-z0-9]/g, '')}@zna.local`
    const yeniSifre = guvenliSifreUret()

    if (dryRun) {
      console.log(`📝 ${k.kullanici_adi.padEnd(20)} → ${email} (şifre sadece --execute'te oluşturulur)`)
      sonuclar.push({ id: k.id, kullanici_adi: k.kullanici_adi, email, yeni_sifre: '(dry-run)' })
      basarili++
      continue
    }

    const { data: authUser, error: authError } = await admin.auth.admin.createUser({
      email,
      password: yeniSifre,
      email_confirm: true,
      user_metadata: { ad: k.ad, kullanici_adi: k.kullanici_adi, tip: k.tip },
    })

    if (authError) {
      console.error(`❌ ${k.kullanici_adi.padEnd(20)} → Auth hatası: ${authError.message}`)
      sonuclar.push({ id: k.id, kullanici_adi: k.kullanici_adi, email, yeni_sifre: '', hata: authError.message })
      hatali++
      continue
    }

    const { error: updateError } = await admin
      .from('kullanicilar')
      .update({ auth_id: authUser.user.id, email })
      .eq('id', k.id)

    if (updateError) {
      console.error(`❌ ${k.kullanici_adi.padEnd(20)} → Link hatası: ${updateError.message}`)
      sonuclar.push({ id: k.id, kullanici_adi: k.kullanici_adi, email, yeni_sifre: yeniSifre, hata: updateError.message })
      hatali++
      continue
    }

    console.log(`✅ ${k.kullanici_adi.padEnd(20)} → ${email}`)
    sonuclar.push({ id: k.id, kullanici_adi: k.kullanici_adi, email, yeni_sifre: yeniSifre })
    basarili++
  }

  // CSV yaz
  const csvPath = 'migrated-users.csv'
  const csv = [
    'id,kullanici_adi,email,yeni_sifre,hata',
    ...sonuclar.map((s) =>
      [s.id, s.kullanici_adi, s.email, s.yeni_sifre || '', s.hata || ''].map((v) => `"${v}"`).join(',')
    ),
  ].join('\n')
  writeFileSync(csvPath, csv, 'utf-8')

  console.log(`\n─────────────────────────────────────`)
  console.log(`✅ Başarılı:  ${basarili}`)
  console.log(`⏭  Atlanan:   ${atlanan}`)
  console.log(`❌ Hatalı:    ${hatali}`)
  console.log(`─────────────────────────────────────`)
  console.log(`\n📄 Detay: ${csvPath}`)

  if (!dryRun && basarili > 0) {
    console.log(`\n⚠️  ${csvPath} plaintext şifre içeriyor.`)
    console.log(`   Kullanıcılara ilet, SONRA dosyayı sil.`)
    console.log(`\n📌 Sonraki adım:`)
    console.log(`   1. Her kullanıcı giriş yapabildiğini doğrulasın`)
    console.log(`   2. 001_auth_migration.sql BÖLÜM C'yi çalıştır (sifre kolonunu kaldır)`)
  }
}

main().catch((err) => {
  console.error('\n💥 Beklenmeyen hata:', err)
  process.exit(1)
})
