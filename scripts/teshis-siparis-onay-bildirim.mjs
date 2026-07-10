import pg from 'pg'
const { Client } = pg
const password = process.env.PGPASSWORD
if (!password) { console.error('PGPASSWORD env var gerekli'); process.exit(1) }
const c = new Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  user: 'postgres.hcrbwxeuscfibgmchdtt',
  port: 5432, database: 'postgres', password,
  ssl: { rejectUnauthorized: false },
})
await c.connect()

console.log('=== Ali / Oğuz için gerçek ad değerleri ===')
const r = await c.query(`
  select id, ad, cep_telefon, rol
  from kullanicilar
  where ad ilike '%ali%' or ad ilike '%uğur%' or ad ilike '%oğuz%' or ad ilike '%meriç%'
     or ad ilike '%ali%ugur%' or ad ilike '%oguz%'
`)
console.table(r.rows)

console.log('\n=== translate ile normalize (Türkçe → ASCII) eşleşme testi ===')
const r2 = await c.query(`
  select id, ad, cep_telefon,
         translate(lower(ad), 'ığüşöçİ', 'igusoci') as norm_ad
  from kullanicilar
  where translate(lower(ad), 'ığüşöçİ', 'igusoci') ilike any (array['%ahmet%agun%', '%ali%ugur%', '%oguz%meri%'])
`)
console.table(r2.rows)

await c.end()
