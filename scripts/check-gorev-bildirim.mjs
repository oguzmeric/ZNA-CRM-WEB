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

console.log('\n=== Kullanıcılar (Oğuz / Sadık) ===')
const k = await client.query(`
  SELECT id, ad, kullanici_adi, email
  FROM kullanicilar
  WHERE ad ILIKE '%oğuz%' OR ad ILIKE '%oguz%' OR ad ILIKE '%sadık%' OR ad ILIKE '%sadik%'
     OR ad ILIKE '%baloğlu%' OR ad ILIKE '%baloglu%' OR ad ILIKE '%meriç%' OR ad ILIKE '%meric%'
  ORDER BY ad
`)
console.table(k.rows)

console.log('\n=== Son 10 görev bildirimi (tip=gorev veya başlık "görev") ===')
const b = await client.query(`
  SELECT b.id, b.alici_id, ka.ad as alici,
         b.gonderen_id, kg.ad as gonderen,
         b.baslik, b.tip, b.okundu, b.olusturma_tarih
  FROM bildirimler b
  LEFT JOIN kullanicilar ka ON ka.id = b.alici_id
  LEFT JOIN kullanicilar kg ON kg.id = b.gonderen_id
  WHERE b.tip = 'gorev' OR b.baslik ILIKE '%görev%'
  ORDER BY b.olusturma_tarih DESC
  LIMIT 10
`)
console.table(b.rows)

console.log('\n=== Son 5 görev (gorevler tablosu) ===')
const g = await client.query(`
  SELECT g.id, g.baslik, g.atanan, ka.ad as atanan_ad,
         g.olusturma_tarih
  FROM gorevler g
  LEFT JOIN kullanicilar ka ON ka.id::text = g.atanan::text
  ORDER BY g.olusturma_tarih DESC
  LIMIT 5
`)
console.table(g.rows)

console.log('\n=== Realtime publication kontrol (bildirimler tablosu var mı?) ===')
const p = await client.query(`
  SELECT schemaname, tablename
  FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime' AND tablename = 'bildirimler'
`)
console.table(p.rows)

console.log('\n=== bildirimler tablosu RLS politikaları ===')
const r = await client.query(`
  SELECT policyname, cmd, roles, qual
  FROM pg_policies
  WHERE tablename = 'bildirimler'
`)
console.table(r.rows)

await client.end()
