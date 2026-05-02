import pg from 'pg'
const password = process.env.PGPASSWORD
if (!password) { console.error('PGPASSWORD gerekli'); process.exit(1) }
const c = new pg.Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  user: 'postgres.hcrbwxeuscfibgmchdtt', port: 5432,
  database: 'postgres', password,
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const r = await c.query(`
  UPDATE kullanicilar
  SET unvan = 'Teknik Müdür'
  WHERE kullanici_adi ILIKE 'ahmetagun' OR kullanici_adi ILIKE 'ahmet%agun%'
  RETURNING id, ad, kullanici_adi, unvan
`)
console.table(r.rows)
await c.end()
