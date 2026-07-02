import pg from 'pg'
const client = new pg.Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  user: 'postgres.hcrbwxeuscfibgmchdtt',
  port: 5432, database: 'postgres', password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

// Test Sadık → Oğuz via RPC
await client.query('BEGIN')
await client.query(`SELECT set_config('request.jwt.claims', '{"sub":"4f66b1d8-43b3-4e21-9fec-a2fe194ad4a1","role":"authenticated"}', true)`)
await client.query(`SET LOCAL role authenticated`)

try {
  const r = await client.query(`
    SELECT public.bildirim_ekle(2, 'RPC Test', 'test mesaj', 'gorev', '/gorevler', NULL) as id
  `)
  console.log('RPC OK:', r.rows[0])
} catch (e) {
  console.error('RPC HATA:', e.message)
}
await client.query('ROLLBACK')
await client.end()
