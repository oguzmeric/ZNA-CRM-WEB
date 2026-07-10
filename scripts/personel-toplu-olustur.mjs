import pg from 'pg'

const { Client } = pg

// DB bağlantı bilgisi env var'lardan alınır — bu dosya git'te tutulur, secret asla gömülmez.
// Kullanım: PGPASSWORD='...' node scripts/personel-toplu-olustur.mjs
const password = process.env.PGPASSWORD
if (!password) {
  console.error('PGPASSWORD env var gerekli. Örnek: PGPASSWORD=\'...\' node scripts/personel-toplu-olustur.mjs')
  process.exit(1)
}
const encoded = encodeURIComponent(password)
const conn = `postgresql://postgres.hcrbwxeuscfibgmchdtt:${encoded}@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`

const kullaniciAdiToEmail = (ka) => `${ka.toLowerCase().replace(/[^a-z0-9]/g, '')}@zna.local`

const normalizeTel = (t) => {
  if (t == null || t === '') return null
  const s = String(t).replace(/\D/g, '')
  if (s.length === 10) return '0' + s
  if (s.length === 11) return s
  return s
}

const yeni = [
  { ad: 'ALP ASLAN', kullanici_adi: 'alp_aslan', tel: '05558940843' },
  { ad: 'Ensar Koçyiğit', kullanici_adi: 'ensar_kocyigit', tel: '05516544365' },
  { ad: 'Hüseyin Anzerli', kullanici_adi: 'huseyin_anzerli', tel: null },
  { ad: 'Mehmet Akif Erel', kullanici_adi: 'mehmet_akif_erel', tel: '05453487155' },
  { ad: 'Muhammet Emin Erdem', kullanici_adi: 'muhammet_emin_erdem', tel: '05386319007' },
  { ad: 'Muhammet Emin Nayman', kullanici_adi: 'muhammet_emin_nayman', tel: '05336342441' },
  { ad: 'Ömer Çadırcı', kullanici_adi: 'omer_cadirci', tel: '05392981244' },
  { ad: 'Sefa Övüngen', kullanici_adi: 'sefa_ovungen', tel: '05538825031' },
  { ad: 'Yasin Zor', kullanici_adi: 'yasin_zor', tel: '05426745884' },
]

const c = new Client({ connectionString: conn })
await c.connect()

try {
  await c.query('BEGIN')

  // 1) Mevcut 'hasan' hesabını güncelle
  const upd = await c.query(
    `UPDATE kullanicilar SET kullanici_adi='hasan_yilmaz', ad='Hasan Yılmaz' WHERE kullanici_adi='hasan' RETURNING id, ad, kullanici_adi`,
  )
  console.log('[GÜNCELLENDİ] hasan →', upd.rows[0])

  const rapor = { olusturuldu: 0, atlandi: 0, hata: 0 }

  for (const p of yeni) {
    const email = kullaniciAdiToEmail(p.kullanici_adi)

    // Zaten var mı?
    const varMi = await c.query(
      `SELECT 1 FROM kullanicilar WHERE kullanici_adi=$1 OR email=$2`,
      [p.kullanici_adi, email],
    )
    if (varMi.rowCount > 0) {
      console.log('[ATLA]', p.kullanici_adi, '(zaten var)')
      rapor.atlandi++
      continue
    }

    // auth.users'a ekle
    const authRes = await c.query(
      `INSERT INTO auth.users (
        instance_id, id, aud, role, email,
        encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        confirmation_token, recovery_token,
        email_change_token_new, email_change
      ) VALUES (
        '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
        'authenticated', 'authenticated', $1,
        crypt($2, gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
        now(), now(),
        '', '', '', ''
      ) RETURNING id`,
      [email, 'admin123.'],
    )
    const auth_id = authRes.rows[0].id

    // kullanicilar'a ekle
    const kul = await c.query(
      `INSERT INTO kullanicilar (
        ad, kullanici_adi, email, auth_id, rol, tip,
        onay_durum, email_dogrulandi, cep_telefon, moduller
      ) VALUES ($1, $2, $3, $4, 'personel', 'zna',
                'onaylandi', true, $5, '{}'::text[])
      RETURNING id, ad, kullanici_adi`,
      [p.ad, p.kullanici_adi, email, auth_id, normalizeTel(p.tel)],
    )
    console.log('[OLUŞTURULDU]', kul.rows[0])
    rapor.olusturuldu++
  }

  await c.query('COMMIT')
  console.log('\nRapor:', rapor)
} catch (e) {
  await c.query('ROLLBACK')
  console.error('HATA - ROLLBACK yapıldı:', e.message)
  process.exit(1)
} finally {
  await c.end()
}
