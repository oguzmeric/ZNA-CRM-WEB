import pg from 'pg'
const client = new pg.Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  user: 'postgres.hcrbwxeuscfibgmchdtt',
  port: 5432, database: 'postgres', password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

// TAM olarak PostgREST'in yaptığı gibi: transaction başlat, GUC set, sonra role
await client.query('BEGIN')
await client.query(`SELECT set_config('request.jwt.claims', '{"sub":"4f66b1d8-43b3-4e21-9fec-a2fe194ad4a1","role":"authenticated"}', true)`)
await client.query(`SET LOCAL role authenticated`)

console.log('auth.uid():', (await client.query(`SELECT auth.uid() as u`)).rows[0])
console.log('is_staff():', (await client.query(`SELECT public.is_staff() as s`)).rows[0])

try {
  const r = await client.query(`
    INSERT INTO bildirimler (alici_id, gonderen_id, baslik, mesaj, tip, link)
    VALUES (2, 23, '__TEST__', 'test', 'gorev', '/gorevler') RETURNING id
  `)
  console.log('INSERT OK:', r.rows[0])
} catch (e) {
  console.error('INSERT hata:', e.message, '\n', e.detail || '')
}
await client.query('ROLLBACK')
await client.end()
