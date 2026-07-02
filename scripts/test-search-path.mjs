import pg from 'pg'
const client = new pg.Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  user: 'postgres.hcrbwxeuscfibgmchdtt',
  port: 5432, database: 'postgres', password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

await client.query('BEGIN')
await client.query(`SELECT set_config('request.jwt.claims', '{"sub":"4f66b1d8-43b3-4e21-9fec-a2fe194ad4a1","role":"authenticated"}', true)`)
await client.query(`SET LOCAL role authenticated`)

// authenticated'ın search_path'i
const sp = await client.query(`SHOW search_path`)
console.log('search_path:', sp.rows[0])

// Politika ifadesinin OLDUĞU GİBİ değerlendirmesi (INSERT dışında)
const t1 = await client.query(`
  SELECT (is_staff() OR (2 IN ( SELECT kullanicilar.id FROM kullanicilar WHERE kullanicilar.auth_id = auth.uid()))) as ok
`)
console.log('expr:', t1.rows[0])

// Kolonu değil, hard-coded değer ile deneyelim
const t2 = await client.query(`
  SELECT policyname, with_check FROM pg_policies
  WHERE tablename='bildirimler' AND cmd='INSERT'
`)
console.log('with_check tam metin:', t2.rows[0])

// Manuel policy check function
try {
  await client.query(`
    CREATE OR REPLACE FUNCTION public.__test_bildirim_check(v_alici bigint) RETURNS boolean
    LANGUAGE sql SECURITY INVOKER STABLE AS $$
      SELECT (is_staff() OR (v_alici IN ( SELECT kullanicilar.id FROM kullanicilar WHERE (kullanicilar.auth_id = auth.uid()))))
    $$
  `)
} catch (e) { console.log('create fn:', e.message) }

await client.end()

// Reconnect ve authenticated olarak test et
const c2 = new pg.Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  user: 'postgres.hcrbwxeuscfibgmchdtt',
  port: 5432, database: 'postgres', password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
})
await c2.connect()
await c2.query('BEGIN')
await c2.query(`SELECT set_config('request.jwt.claims', '{"sub":"4f66b1d8-43b3-4e21-9fec-a2fe194ad4a1","role":"authenticated"}', true)`)
await c2.query(`SET LOCAL role authenticated`)
const t3 = await c2.query(`SELECT public.__test_bildirim_check(2::bigint) as ok`)
console.log('manuel policy fn:', t3.rows[0])
await c2.query('ROLLBACK')
await c2.end()
