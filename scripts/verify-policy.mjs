import pg from 'pg'
const client = new pg.Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  user: 'postgres.hcrbwxeuscfibgmchdtt',
  port: 5432, database: 'postgres', password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

const p = await client.query(`
  SELECT policyname, with_check FROM pg_policies
  WHERE tablename = 'bildirimler' AND cmd = 'INSERT'
`)
console.log(JSON.stringify(p.rows, null, 2))

// Simulate insert as Sadık with the fresh policy
await client.query('BEGIN')
await client.query(`SELECT set_config('request.jwt.claims', '{"sub":"4f66b1d8-43b3-4e21-9fec-a2fe194ad4a1","role":"authenticated"}', true)`)
await client.query(`SET LOCAL role authenticated`)

// Manuel policy testi
const t = await client.query(`
  SELECT
    (SELECT EXISTS (
      SELECT 1 FROM public.kullanicilar
      WHERE auth_id = auth.uid()
        AND rol IN ('admin', 'personel')
        AND coalesce(hesap_silindi, false) = false
    )) as staff_ok,
    (2::bigint IN (SELECT id FROM public.kullanicilar WHERE auth_id = auth.uid())) as self_ok
`)
console.log('Policy koşulları:', t.rows[0])

try {
  const r = await client.query(`
    INSERT INTO bildirimler (alici_id, gonderen_id, baslik, mesaj, tip, link)
    VALUES (2, 23, '__TEST_RETRY__', 'test', 'gorev', '/gorevler') RETURNING id
  `)
  console.log('BAŞARILI:', r.rows[0])
} catch (e) {
  console.error('HATA:', e.message)
}
await client.query('ROLLBACK')
await client.end()
