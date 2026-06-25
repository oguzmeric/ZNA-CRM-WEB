// Browser'daki supabase-js'in YAPTIGI ile birebir ayni cagriyi yap.
// secrets *.env'den okunuyor — git'e gitmez (gitignore'da).
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = fs.readFileSync('.env', 'utf-8').split('\n').reduce((acc, line) => {
  const m = line.match(/^([A-Z_]+)=(.+)$/)
  if (m) acc[m[1]] = m[2].trim()
  return acc
}, {})

const URL = env.VITE_SUPABASE_URL
const ANON = env.VITE_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_KEY

console.log('Using URL:', URL)
console.log('ANON prefix:', ANON?.slice(0, 20))

// 1) Service ile oguz'a temp password set
const admin = createClient(URL, SERVICE)
const TEMP_PW = 'TempTest_' + Date.now() + '!'
const { error: e1 } = await admin.auth.admin.updateUserById(
  '43353bb9-f580-46ac-9fdf-c06ac8dc05ed',
  { password: TEMP_PW }
)
if (e1) { console.log('updateUser err:', e1.message); process.exit(1) }
console.log('✓ Temp password set')

// 2) Sign in
const user = createClient(URL, ANON)
const { data: sess, error: e2 } = await user.auth.signInWithPassword({
  email: 'oguz@znateknoloji.com',
  password: TEMP_PW,
})
if (e2) { console.log('signIn err:', e2.message); process.exit(1) }
console.log('✓ Signed in (access_token len:', sess.session.access_token.length, ')')

// 3) BIREBIR frontend'in yaptigi gibi cagir
console.log('\n→ Calling supabase.functions.invoke("zeyna", ...)')
const { data, error } = await user.functions.invoke('zeyna', {
  body: { mesaj: 'CCTV kurulumda hangi noktalara dikkat etmem gerekir?' },
})

if (error) {
  console.log('\n❌ ERROR:')
  console.log('  type:', error.constructor.name)
  console.log('  message:', error.message)
  console.log('  status:', error.context?.status)
  // Try to parse body
  try {
    if (error.context && typeof error.context.text === 'function') {
      const t = await error.context.text()
      console.log('  body:', t)
    } else {
      console.log('  no context body available')
    }
  } catch (e) {
    console.log('  body parse err:', e.message)
  }
} else {
  console.log('\n✅ SUCCESS:')
  console.log('  ok:', data?.ok)
  console.log('  yanit:', data?.yanit?.slice(0, 300))
}
