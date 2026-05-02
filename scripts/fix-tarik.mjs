import pg from 'pg'

const password = process.env.PGPASSWORD
if (!password) { console.error('PGPASSWORD gerekli'); process.exit(1) }

const client = new pg.Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  user: 'postgres.hcrbwxeuscfibgmchdtt',
  port: 5432,
  database: 'postgres',
  password,
  ssl: { rejectUnauthorized: false },
})

await client.connect()

const r = await client.query(`
  UPDATE kullanicilar
  SET kullanici_adi = 'tarikaltas',
      auth_id = '9f416dee-f983-4590-b69d-2e1844e3d443'
  WHERE id = 14
  RETURNING id, ad, kullanici_adi, auth_id, unvan
`)
console.log('Güncellenen:')
console.table(r.rows)

await client.end()
