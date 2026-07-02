import pg from 'pg'
const client = new pg.Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  user: 'postgres.hcrbwxeuscfibgmchdtt',
  port: 5432, database: 'postgres', password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

console.log('=== is_staff() execute yetkileri ===')
const g = await client.query(`
  SELECT grantee, privilege_type
  FROM information_schema.routine_privileges
  WHERE routine_name = 'is_staff'
`)
console.table(g.rows)

console.log('\n=== authenticated role olarak is_staff test ===')
await client.query('BEGIN')
await client.query(`SET LOCAL role = authenticated`)
await client.query(`SELECT set_config('request.jwt.claims', '{"sub":"4f66b1d8-43b3-4e21-9fec-a2fe194ad4a1","role":"authenticated"}', true)`)

const s1 = await client.query(`SELECT public.is_staff() as sonuc`)
console.log('public.is_staff() olarak:', s1.rows[0])

try {
  const s2 = await client.query(`SELECT is_staff() as sonuc`)
  console.log('is_staff() bare olarak:', s2.rows[0])
} catch (e) {
  console.error('bare is_staff() hata:', e.message)
}

// Şimdi WITH CHECK ifadesini birebir test edelim (policy expression)
console.log('\n=== Policy WITH CHECK expression testi ===')
try {
  const s3 = await client.query(`
    SELECT (is_staff() OR (2::bigint IN ( SELECT kullanicilar.id FROM kullanicilar WHERE kullanicilar.auth_id = auth.uid()))) as ok
  `)
  console.log('Policy expr:', s3.rows[0])
} catch (e) {
  console.error('Policy expr hata:', e.message)
}

await client.query('ROLLBACK')
await client.end()
