import pg from 'pg'
const client = new pg.Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  user: 'postgres.hcrbwxeuscfibgmchdtt',
  port: 5432, database: 'postgres', password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

// Sadık'ın auth.uid'sini set edip role authenticated ile is_staff çağır
await client.query('BEGIN')
await client.query(`SET LOCAL role = authenticated`)
await client.query(`SELECT set_config('request.jwt.claims', '{"sub":"4f66b1d8-43b3-4e21-9fec-a2fe194ad4a1","role":"authenticated"}', true)`)

const uid = await client.query(`SELECT auth.uid() as uid`)
console.log('auth.uid():', uid.rows[0])

const staff = await client.query(`SELECT public.is_staff() as s`)
console.log('is_staff():', staff.rows[0])

const raw = await client.query(`
  SELECT rol IN ('admin','personel') as ok
  FROM kullanicilar WHERE auth_id = auth.uid()
`)
console.log('rol match:', raw.rows)

const raw2 = await client.query(`
  SELECT rol, hesap_silindi FROM kullanicilar WHERE auth_id = auth.uid()
`)
console.log('kullanıcı:', raw2.rows)

// Test: Sadık'ın Oğuz'a bildirim insert edebilir mi?
console.log('\n=== Sadık → Oğuz bildirim insert testi ===')
try {
  const r = await client.query(`
    INSERT INTO bildirimler (alici_id, gonderen_id, baslik, mesaj, tip, link)
    VALUES (2, 23, '__TEST_SIM__', 'test as sadık', 'gorev', '/gorevler')
    RETURNING id
  `)
  console.log('BAŞARILI insert:', r.rows[0])
  await client.query('ROLLBACK')
} catch (e) {
  console.error('RLS reject:', e.message)
  await client.query('ROLLBACK')
}

await client.end()
