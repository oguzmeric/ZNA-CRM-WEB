import pg from 'pg'
const client = new pg.Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  user: 'postgres.hcrbwxeuscfibgmchdtt',
  port: 5432, database: 'postgres', password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

// Bildirimi eksik görevleri bul (RLS bloke ettiği için oluşamamış)
// Fix'ten önceki tüm görev atamalarını topluca yaz
const eksik = await client.query(`
  SELECT g.id, g.baslik, g.atanan::bigint as alici_id, g.son_tarih, g.oncelik, g.olusturan_ad,
         g.olusturma_tarih
  FROM gorevler g
  WHERE g.atanan IS NOT NULL
    AND g.atanan::text ~ '^[0-9]+$'
    AND NOT EXISTS (
      SELECT 1 FROM bildirimler b
      WHERE b.alici_id = g.atanan::bigint
        AND b.baslik ILIKE '%Yeni Görev Atandı%'
        AND b.olusturma_tarih BETWEEN g.olusturma_tarih - interval '5 minutes' AND g.olusturma_tarih + interval '5 minutes'
    )
    AND g.olusturma_tarih > now() - interval '7 days'
  ORDER BY g.olusturma_tarih ASC
`)
console.log('Eksik görev bildirimleri:', eksik.rows.length)
console.table(eksik.rows)

for (const g of eksik.rows) {
  const gonderen = await client.query(`
    SELECT id FROM kullanicilar WHERE ad = $1 LIMIT 1
  `, [g.olusturan_ad])
  const gonderenId = gonderen.rows[0]?.id || null
  await client.query(`
    INSERT INTO bildirimler (alici_id, gonderen_id, baslik, mesaj, tip, link, olusturma_tarih)
    VALUES ($1, $2, 'Yeni Görev Atandı', $3, 'gorev', '/gorevler', $4)
  `, [
    g.alici_id, gonderenId,
    `"${g.baslik}" görevi size atandı. Son tarih: ${g.son_tarih || '—'}`,
    g.olusturma_tarih,
  ])
  console.log(`✓ Görev ${g.id} → alici ${g.alici_id} bildirim yazıldı`)
}

await client.end()
