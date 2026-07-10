// Teşhis: Hasan mobile'da "Görev oluşturulamadı" alıyor.
// Bu script Hasan'ın kullanicilar kaydını + son 3 görev denemesini + RLS policy'lerini kontrol eder.
// Kullanım: node scripts/teshis-hasan-gorev.mjs

import pg from 'pg'
const { Client } = pg

const password = process.env.PGPASSWORD
if (!password) { console.error('PGPASSWORD env var gerekli'); process.exit(1) }

const hosts = [
  { host: 'aws-0-eu-central-1.pooler.supabase.com', user: 'postgres.hcrbwxeuscfibgmchdtt', port: 5432 },
  { host: 'aws-0-eu-west-1.pooler.supabase.com',    user: 'postgres.hcrbwxeuscfibgmchdtt', port: 5432 },
]

async function connect() {
  for (const cfg of hosts) {
    const c = new Client({ ...cfg, database: 'postgres', password, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 })
    try { await c.connect(); console.log('✓ Bağlandı:', cfg.host); return c }
    catch (e) { console.log('✗', cfg.host, e.code || e.message); try { await c.end() } catch {} }
  }
  throw new Error('Hiçbir host bağlanmadı')
}

const c = await connect()

console.log('\n=== 1. Hasan adında kullanıcı(lar) ===')
const users = await c.query(`
  select id, ad, kullanici_adi, email, rol, tip, auth_id is not null as auth_bagli, durum
  from kullanicilar
  where ad ilike '%hasan%'
  order by id
`)
console.table(users.rows)

console.log('\n=== 2. Hasan tarafından son 5 görev (varsa) ===')
const gorevler = await c.query(`
  select id, baslik, olusturan_ad, atanan_ad, atanan_id, durum,
         olusturma_tarih at time zone 'Europe/Istanbul' as olusturma
  from gorevler
  where olusturan_ad ilike '%hasan%'
  order by id desc
  limit 5
`)
console.table(gorevler.rows)

console.log('\n=== 3. gorevler tablosundaki policy(ler) ===')
const policies = await c.query(`
  select policyname, cmd, permissive, roles::text as roles,
         qual as using_expr, with_check as check_expr
  from pg_policies
  where schemaname = 'public' and tablename = 'gorevler'
`)
console.log(JSON.stringify(policies.rows, null, 2))

console.log('\n=== 4. is_staff() Hasan için ne dönüyor? (auth.uid() simülasyonu) ===')
if (users.rows[0]?.auth_id !== null) {
  const hasanAuth = await c.query(`
    select k.ad, k.rol, k.auth_id, (k.rol in ('admin','personel')) as staff_mi
    from kullanicilar k
    where k.ad ilike '%hasan%'
  `)
  console.table(hasanAuth.rows)
} else {
  console.log('(auth_id yok — hesap bağlanmamış olabilir)')
}

console.log('\n=== 5. Son 5 gorev insert denemesi — DB log kısmi (Supabase logs\'a bak) ===')
console.log('Bu bilgi DB\'de tutulmaz, Supabase Dashboard > Logs > Postgres altına bakın.')

await c.end()
console.log('\nTamam.')
