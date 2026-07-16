// Aktivite logları — DB tabanlı (mig 181). Eskiden localStorage'daydı, admin
// başkalarını göremiyordu. Artık: personel kendi logunu yazar/görür, admin hepsini.
import { supabase } from '../lib/supabase'

// Fire-and-forget log yazımı — ana akışı asla bloklamaz/patlatmaz.
export async function aktiviteLogEkle({ kullaniciId, kullaniciAd, tip, sayfa = null, sureSaniye = null, aciklama = null }) {
  if (!kullaniciId || !tip) return
  try {
    await supabase.from('aktivite_loglari').insert({
      kullanici_id: Number(kullaniciId),
      kullanici_ad: kullaniciAd ?? null,
      tip,
      sayfa,
      sure_saniye: sureSaniye,
      aciklama,
    })
  } catch (e) {
    // sessiz — log yazımı UX'i etkilememeli
    if (typeof console !== 'undefined') console.debug?.('[aktiviteLogEkle]', e?.message)
  }
}

// Gün filtresini olusturma_tarih'e çevir
function gunBaslangici(gun) {
  const bugun = new Date()
  if (gun === 'bugun') { const d = new Date(bugun); d.setHours(0, 0, 0, 0); return d }
  if (gun === 'dun')   { const d = new Date(bugun); d.setDate(d.getDate() - 1); d.setHours(0, 0, 0, 0); return d }
  if (gun === 'bu_hafta') { const d = new Date(bugun); d.setDate(bugun.getDate() - bugun.getDay()); d.setHours(0, 0, 0, 0); return d }
  return null
}

// Logları getir. RLS gereği: admin hepsini, personel kendisininkini alır.
// Dönüş şekli ESKİ localStorage kaydıyla aynı (kullaniciId/kullaniciAd/tip/tarih/sayfa/sureSaniye)
// — böylece KullaniciYonetimi/Profil kodları neredeyse değişmeden çalışır.
export async function aktiviteLoglariGetir({ gun = 'hepsi', limit = 3000 } = {}) {
  let q = supabase
    .from('aktivite_loglari')
    .select('*')
    .order('olusturma_tarih', { ascending: false })
    .limit(limit)

  const bas = gunBaslangici(gun)
  if (bas) {
    q = q.gte('olusturma_tarih', bas.toISOString())
    if (gun === 'dun') {
      const bugun = new Date(); bugun.setHours(0, 0, 0, 0)
      q = q.lt('olusturma_tarih', bugun.toISOString())
    }
  }

  const { data, error } = await q
  if (error) { console.warn('[aktiviteLoglariGetir]', error.message); return [] }
  return (data ?? []).map((r) => ({
    id: r.id,
    kullaniciId: String(r.kullanici_id),
    kullaniciAd: r.kullanici_ad,
    tip: r.tip,
    sayfa: r.sayfa,
    sureSaniye: r.sure_saniye,
    aciklama: r.aciklama,
    tarih: r.olusturma_tarih,
  }))
}

// Tüm logları temizle (admin — RLS aktivite_admin_all izin verir)
export async function aktiviteLoglariTemizle() {
  const { error } = await supabase.from('aktivite_loglari').delete().gte('id', 0)
  if (error) { console.warn('[aktiviteLoglariTemizle]', error.message); return false }
  return true
}
