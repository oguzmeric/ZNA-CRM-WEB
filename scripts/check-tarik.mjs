import pg from 'pg'

const password = process.env.PGPASSWORD
if (!password) { console.error('PGPASSWORD gerekli'); process.exit(1) }

const client = new pg.Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  user: 'postgres.hcrbwxeuscfibgmchdtt',
  port: 5432,
  database: 'postgres',
  password,
  ssl: { rejectUnauthorized: false },
})

await client.connect()

const auth = await client.query(`
  SELECT id, email, created_at, last_sign_in_at
  FROM auth.users
  WHERE email ILIKE '%tarik%'
  ORDER BY created_at DESC
`)
console.log('=== auth.users (tarik):', auth.rows.length, 'kayıt ===')
console.table(auth.rows)

const kullanici = await client.query(`
  SELECT id, ad, kullanici_adi, unvan, hesap_silindi, auth_id, tip
  FROM kullanicilar
  WHERE kullanici_adi ILIKE '%tarik%' OR ad ILIKE '%tarık%' OR ad ILIKE '%tarik%'
`)
console.log('\n=== kullanicilar (tarik):', kullanici.rows.length, 'kayıt ===')
console.table(kullanici.rows)

await client.end()
