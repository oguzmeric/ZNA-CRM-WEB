import pg from 'pg'
const { Client } = pg
const c = new Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  user: 'postgres.hcrbwxeuscfibgmchdtt',
  port: 5432, database: 'postgres',
  password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
})
await c.connect()

let r = await c.query(`select id from musteriler where firma = 'TALAY LOJİSTİK'`)
let talayId = r.rows[0]?.id

if (!talayId) {
  const ins = await c.query(
    `insert into musteriler (ad, soyad, firma, telefon, kod, durum)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    ['Seyhan', 'Meriç', 'TALAY LOJİSTİK', '-', 'TLY-0001', 'aktif']
  )
  talayId = ins.rows[0].id
  console.log('TALAY LOJİSTİK oluşturuldu, id:', talayId)
} else {
  console.log('TALAY LOJİSTİK zaten var, id:', talayId)
}

const upd = await c.query(
  `update kullanicilar set musteri_id = $1 where kullanici_adi = 'seyhan.m' returning id, kullanici_adi, musteri_id`,
  [talayId]
)
console.log('seyhan.m bağlandı:', upd.rows[0])

await c.query(`notify pgrst, 'reload schema'`)
console.log('✓ PostgREST cache reload bildirildi')

await c.end()
