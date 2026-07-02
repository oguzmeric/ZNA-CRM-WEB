import pg from 'pg'
const client = new pg.Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  user: 'postgres.hcrbwxeuscfibgmchdtt',
  port: 5432, database: 'postgres', password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

// Test 1: As postgres (superuser)
console.log('=== TEST 1: postgres olarak ===')
await client.query('BEGIN')
try {
  const r = await client.query(`
    INSERT INTO bildirimler (alici_id, gonderen_id, baslik, tip)
    VALUES (2, 23, '__TEST_PG__', 'gorev') RETURNING id
  `)
  console.log('OK:', r.rows[0])
} catch (e) { console.error('HATA:', e.message) }
await client.query('ROLLBACK')

// Test 2: Let's see current_user, session_user
console.log('\n=== Session info ===')
const s = await client.query(`SELECT current_user, session_user, current_setting('role') as role`)
console.log(s.rows)

// Test 3: set role explicit to different levels and try authenticate
for (const claims of [
  '{"sub":"a9ffaf8a-d9e3-40bc-a2b2-dd4f649d564a","role":"authenticated"}', // Oğuz (admin)
  '{"sub":"af626c70-7cb7-4cb2-8ddd-e48cbb7d9225","role":"authenticated"}', // Ali (admin)
  '{"sub":"4f66b1d8-43b3-4e21-9fec-a2fe194ad4a1","role":"authenticated"}', // Sadık (personel)
]) {
  console.log('\n=== TEST: claims=', claims)
  await client.query('BEGIN')
  await client.query(`SELECT set_config('request.jwt.claims', '${claims}', true)`)
  await client.query(`SET LOCAL role authenticated`)
  const uid = await client.query(`SELECT auth.uid()`)
  console.log('uid:', uid.rows[0])
  const staff = await client.query(`SELECT public.is_staff()`)
  console.log('is_staff:', staff.rows[0])
  try {
    const r = await client.query(`
      INSERT INTO bildirimler (alici_id, gonderen_id, baslik, tip)
      VALUES (2, 23, '__TEST__', 'gorev') RETURNING id
    `)
    console.log('OK:', r.rows[0])
  } catch (e) { console.error('HATA:', e.message) }
  await client.query('ROLLBACK')
}

await client.end()
