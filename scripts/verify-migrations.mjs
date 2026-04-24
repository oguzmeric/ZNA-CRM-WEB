import pg from 'pg'
const { Client } = pg

const client = new Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  user: 'postgres.hcrbwxeuscfibgmchdtt',
  port: 5432, database: 'postgres',
  password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

const r1 = await client.query(`
  select column_name, data_type
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'musteriler'
     and column_name = 'temsilci_kullanici_id'
`)
console.log('musteriler.temsilci_kullanici_id:', r1.rows)

const r2 = await client.query(`
  select column_name, data_type
    from information_schema.columns
   where table_schema = 'public' and table_name = 'duyurular'
   order by ordinal_position
`)
console.log('\nduyurular kolonları:')
r2.rows.forEach(r => console.log(`  ${r.column_name} : ${r.data_type}`))

const r3 = await client.query(`
  select policyname from pg_policies
   where schemaname = 'public'
     and tablename in ('kullanicilar', 'duyurular')
     and policyname in ('kullanicilar_customer_temsilci_read','duyurular_staff_all','duyurular_customer_read')
`)
console.log('\nYeni RLS policy\'leri:')
r3.rows.forEach(r => console.log(`  ${r.policyname}`))

await client.end()
