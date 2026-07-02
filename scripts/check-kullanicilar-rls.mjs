import pg from 'pg'
const client = new pg.Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  user: 'postgres.hcrbwxeuscfibgmchdtt',
  port: 5432, database: 'postgres', password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

console.log('=== kullanicilar policies ===')
const p = await client.query(`
  SELECT policyname, cmd, qual FROM pg_policies WHERE tablename='kullanicilar' AND cmd='SELECT'
`)
console.table(p.rows)

// Sadık'ın gözünden ne görünüyor?
console.log('\n=== Sadık kullanicilar SELECT sonucu ===')
await client.query('BEGIN')
await client.query(`SELECT set_config('request.jwt.claims', '{"sub":"4f66b1d8-43b3-4e21-9fec-a2fe194ad4a1","role":"authenticated"}', true)`)
await client.query(`SET LOCAL role authenticated`)
const rows = await client.query(`SELECT id, ad, rol FROM kullanicilar WHERE auth_id = auth.uid()`)
console.log('WHERE auth_id=auth.uid():', rows.rows)

const rows2 = await client.query(`SELECT id, ad, rol FROM kullanicilar`)
console.log('Toplam gördüğü satır:', rows2.rows.length)

await client.query('ROLLBACK')
await client.end()
