import pg from 'pg'
const client = new pg.Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  user: 'postgres.hcrbwxeuscfibgmchdtt',
  port: 5432, database: 'postgres', password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

console.log('\n=== is_staff() fonksiyonu tanımı ===')
const f = await client.query(`
  SELECT proname, pg_get_functiondef(oid) as def
  FROM pg_proc WHERE proname = 'is_staff'
`)
for (const r of f.rows) console.log(r.def)

console.log('\n=== Kullanıcı tipleri ===')
const k = await client.query(`
  SELECT id, ad, tip, hesap_silindi FROM kullanicilar
  WHERE id IN (1, 2, 23, 29)
`)
console.table(k.rows)

console.log('\n=== Sadık için simüle: staff olarak sayılıyor mu? ===')
// Sadık'ın auth.uid'sini simule ederek is_staff() çağır
await client.query(`SET LOCAL role = authenticated`)
try {
  const r = await client.query(`
    SELECT set_config('request.jwt.claims', json_build_object('sub', '4f66b1d8-43b3-4e21-9fec-a2fe194ad4a1')::text, true)
  `)
  const s = await client.query(`SELECT public.is_staff() as sonuc`)
  console.log('Sadık is_staff():', s.rows[0])
} catch (e) {
  console.error('Simülasyon:', e.message)
}

await client.end()
