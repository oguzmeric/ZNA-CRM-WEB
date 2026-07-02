import pg from 'pg'
const client = new pg.Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  user: 'postgres.hcrbwxeuscfibgmchdtt',
  port: 5432, database: 'postgres', password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

console.log('=== Son 10 bildirim (fix sonrası oluşan var mı?) ===')
const b = await client.query(`
  SELECT b.id, ka.ad as alici, kg.ad as gonderen, b.baslik, b.tip, b.olusturma_tarih
  FROM bildirimler b
  LEFT JOIN kullanicilar ka ON ka.id = b.alici_id
  LEFT JOIN kullanicilar kg ON kg.id = b.gonderen_id
  ORDER BY b.olusturma_tarih DESC LIMIT 10
`)
console.table(b.rows)

console.log('\n=== Son 5 görev ===')
const g = await client.query(`
  SELECT id, baslik, atanan, olusturan_ad, olusturma_tarih
  FROM gorevler ORDER BY olusturma_tarih DESC LIMIT 5
`)
console.table(g.rows)

console.log('\n=== bildirim_ekle RPC var mı? ===')
const f = await client.query(`
  SELECT proname FROM pg_proc WHERE proname IN ('bildirim_ekle', 'bildirim_ekle_coklu')
`)
console.table(f.rows)

await client.end()
