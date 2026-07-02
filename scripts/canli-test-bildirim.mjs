import pg from 'pg'
const client = new pg.Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  user: 'postgres.hcrbwxeuscfibgmchdtt',
  port: 5432, database: 'postgres', password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

// Oğuz'a (id=2) canlı bir test bildirimi yaz — Sadık'tan geliyor gibi (id=23)
const r = await client.query(`
  INSERT INTO bildirimler (alici_id, gonderen_id, baslik, mesaj, tip, link)
  VALUES (2, 23, 'Yeni Görev Atandı', 'Canlı test - Sadıktan gelen görev — pop-up geliyor mu?', 'gorev', '/gorevler')
  RETURNING id, olusturma_tarih
`)
console.log('Test bildirim yazıldı:', r.rows[0])
console.log('Şimdi tab-açık Oğuz browserında toast + notification istemi görünmeli')
await client.end()
