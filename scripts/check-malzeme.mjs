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

const son = await c.query(`
  SELECT id, talep_no, ana_tur, durum, olusturma_tarihi
  FROM servis_talepleri
  ORDER BY id DESC
  LIMIT 5
`)
console.log('=== Son 5 talep ===')
console.table(son.rows)

const mlz = await c.query(`
  SELECT mp.id, mp.servis_talep_id, mp.stok_adi, mp.planli_miktar, mp.tip
  FROM servis_malzeme_plani mp
  WHERE mp.servis_talep_id = ANY($1)
  ORDER BY mp.id DESC
`, [son.rows.map(r => r.id)])
console.log('\n=== Bu taleplere ait malzeme planları ===')
console.table(mlz.rows)

const rls = await c.query(`
  SELECT polname, polcmd, polroles::regrole[]
  FROM pg_policy
  WHERE polrelid = 'servis_malzeme_plani'::regclass
`)
console.log('\n=== RLS policies ===')
console.table(rls.rows)

await c.end()
