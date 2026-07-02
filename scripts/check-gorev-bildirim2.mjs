import pg from 'pg'
const password = process.env.PGPASSWORD
const client = new pg.Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  user: 'postgres.hcrbwxeuscfibgmchdtt',
  port: 5432, database: 'postgres', password,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

console.log('\n=== Son 15 bildirim (tüm tipler) ===')
const b = await client.query(`
  SELECT b.id, ka.ad as alici, kg.ad as gonderen,
         b.baslik, b.tip, b.okundu, b.olusturma_tarih
  FROM bildirimler b
  LEFT JOIN kullanicilar ka ON ka.id = b.alici_id
  LEFT JOIN kullanicilar kg ON kg.id = b.gonderen_id
  ORDER BY b.olusturma_tarih DESC
  LIMIT 15
`)
console.table(b.rows)

console.log('\n=== gorevler.olusturan_ad var mı? kolon listesi ===')
const c = await client.query(`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'gorevler' ORDER BY ordinal_position
`)
console.table(c.rows.map(r => r.column_name).join(', '))

console.log('\n=== Son 5 görevi tam detayla ===')
const g = await client.query(`
  SELECT id, baslik, atanan, olusturan_ad, olusturma_tarih
  FROM gorevler
  ORDER BY olusturma_tarih DESC LIMIT 5
`)
console.table(g.rows)

await client.end()
