import pg from 'pg'
const client = new pg.Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  user: 'postgres.hcrbwxeuscfibgmchdtt',
  port: 5432, database: 'postgres', password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

console.log('=== bildirimler tablo yetkileri ===')
const p = await client.query(`
  SELECT grantee, privilege_type FROM information_schema.role_table_grants
  WHERE table_name = 'bildirimler'
  ORDER BY grantee, privilege_type
`)
console.table(p.rows)

console.log('\n=== TÜM bildirimler policyleri (permissive+restrictive) ===')
const q = await client.query(`
  SELECT policyname, cmd, permissive, roles, qual, with_check
  FROM pg_policies WHERE tablename = 'bildirimler' ORDER BY cmd, permissive
`)
console.table(q.rows.map(r => ({
  policy: r.policyname, cmd: r.cmd, perm: r.permissive, roles: JSON.stringify(r.roles)
})))

// Check if RLS is FORCE'd
const r = await client.query(`
  SELECT relname, relrowsecurity, relforcerowsecurity
  FROM pg_class WHERE relname = 'bildirimler'
`)
console.log('\nRLS state:', r.rows)

await client.end()
