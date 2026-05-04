// Başakşehir Belediyesi'ne 60 lokasyon ekler.
// Idempotent: aynı müşteri+ad zaten varsa atlar.
//
// Kullanım:
//   PGPASSWORD=... node scripts/seed-basaksehir-lokasyonlari.mjs
// PowerShell:
//   $env:PGPASSWORD="..."; node scripts/seed-basaksehir-lokasyonlari.mjs

import pg from 'pg'

const { Client } = pg

const password = process.env.PGPASSWORD
if (!password) { console.error('PGPASSWORD env var gerekli'); process.exit(1) }

const LOKASYONLAR = [
  'AYAZMA SPOR PARKI',
  'İNOVASYON VE TEKNOLOJİ MERKEZİ',
  'NECİP FAZIL KISAKÜREK KÜLTÜR VE YAŞAM PARKI',
  'NİKAH SARAYI',
  'FENERTEPE KÜLTÜR YAŞAM MERKEZİ',
  'Z KUŞAĞI',
  'KAYAŞEHİR KÜLTÜR VE YAŞAM MERKEZİ',
  'ALTINŞEHİR MİLLET BAHÇESİ',
  'ALTINŞEHİR SPOR PARKI',
  'ALTINŞEHİR KÜLTÜR VE YAŞAM MERKEZİ',
  'GÜVERCİNTEPE KÜLTÜR VE YAŞAM MERKEZİ',
  'SEZAİ KARAKOÇ GENÇLİK MERKEZİ',
  'GÜVERCİNTEPE SPOR PARKI HAVUZ',
  'HAYVAN HASTANESİ',
  'ŞAMLAR İZCİ KAMPI',
  'CEVDET KILIÇLAR KÜLTÜR VE YAŞAM MERKEZİ',
  'ŞEHİT SAVCI SELİM KİRAZ KÜLTÜR VE YAŞAM MERKEZİ',
  'ÇAM SAKURA MİLLET BAHÇESİ',
  'BAŞAKŞEHİR KADEME',
  'BAHÇEŞEHİR SPOR MERKEZİ',
  'ÖZDEMİR BAYRAKTAR KÜLTÜR VE YAŞAM MERKEZİ',
  'TEOMAN DURALI BAHÇEKENT MİLLET KÜTÜPHANESİ',
  'BAHÇEŞEHİR EBUSSUUD EFENDİ KÜTÜPHANESİ',
  'MUHSİN ERTUĞRUL KÜLTÜR MERKEZİ',
  'BAHÇEŞEHİR GELİŞİM BİNASI',
  'BAHÇEŞEHİR EK HİZMET BİNASI',
  'BAHÇEŞEHİR KÜLTÜR SANAT MERKEZİ',
  'BAHÇEŞEHİR KÜLTÜR VE YAŞAM MERKEZİ',
  'KAYAŞEHİR SPOR PARKI',
  'ŞAMLAR 5. KAPI',
  'GÜVERCİNTEPE SPOR PARKI',
  'EMİN SARAÇ KÜLTÜR MERKEZİ',
  'BAHÇEŞEHİR ÇEVRE KORUMA',
  'BAŞAKŞEHİR SPOR PARKI',
  'BAHÇEŞEHİR TENİS PARKI',
  'BAHÇEŞEHİR KADEME',
  'AKİF İNAN KÜLTÜR YAŞAM MERKEZİ',
  'CEMİL MERİÇ KÜLTÜR YAŞAM MERKEZİ',
  'ŞEHİT ERDEM ÖZÇELİK STADI',
  'ANNE ÇOCUK MERKEZİ',
  'AT ÇİFTLİĞİ',
  'BAŞAKŞEHİR MİLLET BAHÇESİ',
  'ENGELSİZ YAŞAM MERKEZİ',
  'BAHÇEŞEHİR BİZİM ÇINARLAR',
  'ÇAM SAKURA BİZİM ÇINARLAR',
  'ŞAHİNTEPE SPOR PARKI',
  'ŞAHİNTEPE KÜLTÜR VE YAŞAM MERKEZİ',
  'KAYAPARK BİZİM ÇINARLAR',
  'BAŞAKŞEHİR MİLLET BAHÇESİ SPOR PARKI',
  'BAHÇEKENT SPOR PARKI',
  'SULARVADİSİ',
  'SULARVADİSİ BİZİM ÇINARLAR',
  'BAŞAKŞEHİR ÇEVRE KORUMA',
  'GÜVERCİNTEPE GERİ DÖNÜŞÜM',
  'KORUPARK SPORPARK',
  'BAHÇEŞEHİR GÖLET DOĞA PARKI',
  'HACI BEKTAŞI VELİ KÜTÜPHANESİ',
  'SOSYAL YARDIM MAĞAZA',
  'BAŞAKŞEHİR TAZİYE EVİ',
  'BAHÇEŞEHİR SPOR PARKI HALISAHA',
]

const hosts = [
  { host: 'aws-0-eu-central-1.pooler.supabase.com', user: 'postgres.hcrbwxeuscfibgmchdtt', port: 5432, label: 'pooler eu-central-1' },
  { host: 'aws-0-eu-west-1.pooler.supabase.com',    user: 'postgres.hcrbwxeuscfibgmchdtt', port: 5432, label: 'pooler eu-west-1' },
  { host: 'aws-0-us-east-1.pooler.supabase.com',    user: 'postgres.hcrbwxeuscfibgmchdtt', port: 5432, label: 'pooler us-east-1' },
  { host: 'db.hcrbwxeuscfibgmchdtt.supabase.co',    user: 'postgres',                       port: 5432, label: 'direct' },
]

async function connect() {
  for (const cfg of hosts) {
    const client = new Client({
      host: cfg.host, user: cfg.user, port: cfg.port,
      database: 'postgres', password,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000,
    })
    try {
      await client.connect()
      console.log(`✓ Bağlandı: ${cfg.label}`)
      return client
    } catch (e) {
      console.log(`✗ ${cfg.label}: ${e.message}`)
      try { await client.end() } catch {}
    }
  }
  throw new Error('Hiçbir host ile bağlanılamadı')
}

const client = await connect()

try {
  // Başakşehir Belediyesi müşteri kayıtlarını bul
  const { rows: musteriler } = await client.query(
    `select id, ad, soyad, firma from musteriler
     where firma ilike '%başakşehir%belediye%' or firma ilike '%basaksehir%belediye%'
     order by id`
  )

  if (musteriler.length === 0) {
    console.error('\n✗ "Başakşehir Belediyesi" müşteri kaydı bulunamadı.')
    console.error('  Önce Müşteriler sayfasından bir kayıt ekleyin (firma alanı: "Başakşehir Belediyesi" gibi).')
    process.exit(1)
  }

  console.log(`\nBulunan müşteri kayıtları (${musteriler.length}):`)
  musteriler.forEach(m => console.log(`  #${m.id}: ${m.ad} ${m.soyad} — ${m.firma}`))

  // İlk müşteri kaydını ana referans olarak kullan
  const anaMusteri = musteriler[0]
  console.log(`\n→ Lokasyonlar şu kayda eklenecek: #${anaMusteri.id} (${anaMusteri.firma})`)

  // Mevcut lokasyonları çek
  const { rows: mevcutlar } = await client.query(
    'select ad from musteri_lokasyonlari where musteri_id = $1',
    [anaMusteri.id]
  )
  const mevcutSet = new Set(mevcutlar.map(r => r.ad.trim()))
  console.log(`  Mevcut lokasyon: ${mevcutSet.size} adet`)

  // Yeni eklenecek lokasyonlar (mevcut olmayanlar)
  const eklenecekler = LOKASYONLAR.filter(ad => !mevcutSet.has(ad.trim()))
  console.log(`  Yeni eklenecek: ${eklenecekler.length} adet`)
  console.log(`  Atlanan (zaten var): ${LOKASYONLAR.length - eklenecekler.length} adet`)

  if (eklenecekler.length === 0) {
    console.log('\n✓ Tüm lokasyonlar zaten ekli.')
    process.exit(0)
  }

  // Bulk insert
  const values = []
  const params = []
  eklenecekler.forEach((ad, i) => {
    values.push(`($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`)
    params.push(anaMusteri.id, ad, true)
  })
  const sql = `insert into musteri_lokasyonlari (musteri_id, ad, aktif) values ${values.join(', ')} returning id, ad`
  const { rows: eklendi } = await client.query(sql, params)

  console.log(`\n✓ ${eklendi.length} lokasyon eklendi:`)
  eklendi.forEach(r => console.log(`  +${r.id}: ${r.ad}`))
} catch (err) {
  console.error('\n✗ Hata:', err.message)
  process.exit(1)
} finally {
  await client.end()
}
