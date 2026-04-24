// Bir kerelik migration runner.
// Kullanım: PGPASSWORD=... node scripts/run-migrations.mjs path/to/file.sql [path/to/another.sql]
import pg from 'pg'
import fs from 'fs'

const { Client } = pg

const password = process.env.PGPASSWORD
if (!password) { console.error('PGPASSWORD env var gerekli'); process.exit(1) }

const files = process.argv.slice(2)
if (files.length === 0) { console.error('Kullanım: node run-migrations.mjs file1.sql [file2.sql ...]'); process.exit(1) }

// Host seçenekleri — sırayla denenir (direct IPv4 kullanılamıyorsa pooler session mode)
const hosts = [
  { host: 'aws-0-eu-central-1.pooler.supabase.com', user: 'postgres.hcrbwxeuscfibgmchdtt', port: 5432, label: 'pooler eu-central-1 (session)' },
  { host: 'aws-0-eu-west-1.pooler.supabase.com',    user: 'postgres.hcrbwxeuscfibgmchdtt', port: 5432, label: 'pooler eu-west-1 (session)' },
  { host: 'aws-0-us-east-1.pooler.supabase.com',    user: 'postgres.hcrbwxeuscfibgmchdtt', port: 5432, label: 'pooler us-east-1 (session)' },
  { host: 'db.hcrbwxeuscfibgmchdtt.supabase.co',    user: 'postgres',                       port: 5432, label: 'direct' },
]

async function connect() {
  for (const cfg of hosts) {
    const client = new Client({
      host: cfg.host, user: cfg.user, port: cfg.port,
      database: 'postgres', password,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000,
    })
    try {
      await client.connect()
      console.log(`✓ Bağlandı: ${cfg.label}`)
      return client
    } catch (e) {
      console.log(`✗ ${cfg.label}: ${e.message}`)
      try { await client.end() } catch {}
    }
  }
  throw new Error('Hiçbir host ile bağlanılamadı')
}

const client = await connect()

for (const file of files) {
  console.log(`\n── ${file} ──`)
  const sql = fs.readFileSync(file, 'utf-8')
  try {
    await client.query(sql)
    console.log('  ✓ Başarıyla çalıştırıldı')
  } catch (e) {
    console.error(`  ✗ Hata: ${e.message}`)
    if (e.position) console.error(`    pozisyon: ${e.position}`)
  }
}

await client.end()
console.log('\nTamamlandı.')
