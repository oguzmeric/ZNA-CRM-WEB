import pg from 'pg'
const client = new pg.Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  user: 'postgres.hcrbwxeuscfibgmchdtt',
  port: 5432, database: 'postgres', password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

// All is_staff functions across schemas
const f = await client.query(`
  SELECT n.nspname as schema, p.proname, p.prosecdef as security_definer, p.provolatile,
         pg_get_function_arguments(p.oid) as args,
         pg_get_functiondef(p.oid) as def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname LIKE '%is_staff%' OR p.proname LIKE '%staff%'
`)
console.log('is_staff varyantları:', f.rows.length)
for (const r of f.rows) {
  console.log(`--- ${r.schema}.${r.proname}(${r.args}) secdef=${r.security_definer} vol=${r.provolatile}`)
  console.log(r.def)
}

await client.end()
