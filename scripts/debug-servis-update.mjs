import pg from 'pg'
const c = new pg.Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  user: 'postgres.hcrbwxeuscfibgmchdtt',
  port: 5432, database: 'postgres',
  password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
})
await c.connect()
try {
  const r = await c.query(`
    update servis_talepleri
       set servis_tipi='ariza,bakim',
           yukumluluk='garanti',
           servis_yeri='yerinde',
           seri_numarasi='X1',
           marka='M1', model='Mod1',
           kunye_numarasi='K1',
           yedek_parcalar='[]'::jsonb,
           guncelleme_tarihi=now()
     where id=62
     returning id, talep_no, servis_tipi`)
  console.log('UPDATE OK:', r.rows)
} catch (e) {
  console.log('HATA:', e.message)
  console.log('Detail:', e.detail)
}
await c.end()
