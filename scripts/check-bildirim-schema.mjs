import pg from 'pg'
const client = new pg.Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  user: 'postgres.hcrbwxeuscfibgmchdtt',
  port: 5432, database: 'postgres', password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

console.log('\n=== bildirimler kolonları + tipleri ===')
const cols = await client.query(`
  SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_name = 'bildirimler' ORDER BY ordinal_position
`)
console.table(cols.rows)

console.log('\n=== bildirimler check constraint ===')
const chk = await client.query(`
  SELECT constraint_name, check_clause
  FROM information_schema.check_constraints
  WHERE constraint_name IN (
    SELECT constraint_name FROM information_schema.table_constraints
    WHERE table_name = 'bildirimler'
  )
`)
console.table(chk.rows)

console.log('\n=== Test insert deneme (tip=gorev alici=2) ===')
try {
  const r = await client.query(`
    INSERT INTO bildirimler (alici_id, gonderen_id, baslik, mesaj, tip, link)
    VALUES (2, 23, '__TEST__', 'test insert', 'gorev', '/gorevler')
    RETURNING id, tip
  `)
  console.log('OK, insert edildi:', r.rows[0])
  await client.query(`DELETE FROM bildirimler WHERE id = ${r.rows[0].id}`)
  console.log('temizlendi')
} catch (e) {
  console.error('INSERT hatası:', e.message)
}

await client.end()
