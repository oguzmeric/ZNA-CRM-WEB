import pg from 'pg'
const client = new pg.Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  user: 'postgres.hcrbwxeuscfibgmchdtt',
  port: 5432, database: 'postgres', password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

console.log('\n=== kullanicilar kolonları — rol var mı? ===')
const c = await client.query(`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'kullanicilar' AND (column_name ILIKE '%rol%' OR column_name = 'tip')
`)
console.table(c.rows)

console.log('\n=== rol/tip dagilimi ===')
const d = await client.query(`
  SELECT tip, rol, count(*) FROM kullanicilar
  GROUP BY tip, rol ORDER BY count DESC
`)
console.table(d.rows)

console.log('\n=== Sadık, Ali, Oğuz rol/tip ===')
const k = await client.query(`
  SELECT id, ad, rol, tip FROM kullanicilar
  WHERE id IN (1, 2, 23)
`)
console.table(k.rows)

await client.end()
