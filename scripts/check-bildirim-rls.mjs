import pg from 'pg'
const client = new pg.Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  user: 'postgres.hcrbwxeuscfibgmchdtt',
  port: 5432, database: 'postgres', password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

console.log('\n=== bildirimler policies + with_check ===')
const p = await client.query(`
  SELECT policyname, cmd, permissive, roles, qual, with_check
  FROM pg_policies
  WHERE tablename = 'bildirimler'
`)
console.table(p.rows)

console.log('\n=== RLS enabled? ===')
const r = await client.query(`
  SELECT rowsecurity FROM pg_tables WHERE tablename = 'bildirimler'
`)
console.log(r.rows)

console.log('\n=== Auth ID Oğuz ve Sadık için ===')
const a = await client.query(`
  SELECT id, ad, auth_id FROM kullanicilar WHERE id IN (2, 23, 1)
`)
console.table(a.rows)

await client.end()
