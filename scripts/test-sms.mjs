// SMS API direkt test — Oğuz'a bir SMS gönder ve debug et.

const SUPA_URL = 'https://hcrbwxeuscfibgmchdtt.supabase.co'
const ANON_KEY = 'sb_publishable_nJp6uOQ3NTVuwWmsHkelWA_VIZzQ_M6'

const mesaj = "ZNA CRM Test: Gorev SMS altyapisi test mesaji. Bu mesaji aldiysaniz sistem calisiyor demektir."

const res = await fetch(SUPA_URL + '/functions/v1/sms-gonder', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + ANON_KEY,
    'apikey': ANON_KEY,
  },
  body: JSON.stringify({ gsm: '5386450790', mesaj }),
})
console.log('HTTP:', res.status)
console.log('Body:', await res.text())
