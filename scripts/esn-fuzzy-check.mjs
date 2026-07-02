import fs from 'fs'
import pg from 'pg'

const CSV = 'C:\\Users\\MSI-LA~1\\AppData\\Local\\Temp\\claude\\C--Users-MSI-LAPTOP-crm-app--claude-worktrees-adoring-hermann-edb720\\27864d07-065e-47f1-9946-9280ea81ec99\\scratchpad\\esn3.csv'

const raw = fs.readFileSync(CSV, 'utf-8').replace(/^﻿/, '')
const lines = raw.split(/\r?\n/).filter(l => l.trim())
const headers = lines[0].split(';')
const rows = lines.slice(1).map(l => {
  const vals = []; let cur = '', inQ = false
  for (const ch of l) {
    if (ch === '"') { inQ = !inQ; continue }
    if (ch === ';' && !inQ) { vals.push(cur); cur = ''; continue }
    cur += ch
  }
  vals.push(cur)
  const o = {}; headers.forEach((h, i) => o[h] = vals[i] || '')
  return o
})

const firmaMap = new Map()
for (const r of rows) {
  if (!firmaMap.has(r.firma_adi)) firmaMap.set(r.firma_adi, {tekliflar: new Set(), kalemler: 0})
  firmaMap.get(r.firma_adi).tekliflar.add(r.teklif_no)
  firmaMap.get(r.firma_adi).kalemler++
}

console.log('CSV benzersiz firma:', firmaMap.size)

const c = new pg.Client({host: 'aws-0-eu-west-1.pooler.supabase.com', user: 'postgres.hcrbwxeuscfibgmchdtt', port: 5432, database: 'postgres', password: process.env.PGPASSWORD, ssl: {rejectUnauthorized: false}})
await c.connect()

const firmaListe = [...firmaMap.keys()]
const q = await c.query(`SELECT firma_adi, count(*) as sayi FROM teklifler WHERE firma_adi = ANY($1::text[]) GROUP BY firma_adi ORDER BY sayi DESC`, [firmaListe])
console.log(`\nCRM'de tam firma_adi eşleşen: ${q.rows.length} firma`)
q.rows.slice(0, 20).forEach(r => console.log(`  ${r.firma_adi.slice(0, 50)} → ${r.sayi} teklif`))

const csvFisnos = rows.map(r => r.teklif_no)
const direkt = await c.query(`SELECT teklif_no, firma_adi FROM teklifler WHERE teklif_no = ANY($1)`, [csvFisnos])
console.log(`\nDirekt teklif_no eşleşen: ${direkt.rows.length}`)

// Muhtemel eşleşme: aynı firma + yakın tarih
console.log(`\nMuhtemel eşleşme ilk 20 firma için (aynı firma + tarih):`)
let match = 0
for (const [firma, {tekliflar}] of [...firmaMap].slice(0, 20)) {
  for (const tno of tekliflar) {
    const r = await c.query(`SELECT teklif_no FROM teklifler WHERE firma_adi = $1 LIMIT 5`, [firma])
    if (r.rows.length > 0) {
      console.log(`  ${firma.slice(0, 40)} (CSV: ${tno}) → CRM: ${r.rows.map(x => x.teklif_no).join(', ')}`)
      match++
      break
    }
  }
}
console.log(`\nOn top firmadan ${match}'de eşleşme bulundu.`)

await c.end()
