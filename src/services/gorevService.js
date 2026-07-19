import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'
import { cached, invalidate } from '../lib/cache'

// LİSTE kolonları: notlar + yorumlar jsonb HARİÇ — mobil not/foto geçmişi
// büyüdükçe listeyi şişiriyordu; liste/kanban bu alanları hiç okumuyor.
// Detay sayfası gorevGetir(id) ile tam kaydı alır. Yeni kolon eklerken buraya da ekle.
const GOREV_LISTE_KOLONLARI = `id, baslik, aciklama, durum, oncelik, atanan_id, atanan_ad,
  olusturan_ad, bitis_tarihi, tamamlanma_tarihi, firma_adi, musteri_id, olusturma_tarih,
  musteri_adi, atanan, son_tarih, lokasyon_id, gorusme_id, servis_talep_id,
  baslama_tarih, bitis_tarih, devam_sebep, ekip,
  gorev_no, ust_gorev_id, seviye, olusturan_id, kategori_id, ilerleme, ilerleme_modu,
  kabul_durumu, red_sebebi, onay_gerekli, onaylayici_id, onay_durumu, gizlilik,
  gozlemciler, zorunlu, tamamlama_kurali, bagimli_gorev_id, bagimlilik_turu, etiketler,
  teklif_id, siparis_id, kesif_id, atama_turu, devreden_id, durum_sebebi, bitis_saat`

export const gorevleriGetir = () => cached('gorevler:list', async () => {
  const hepsi = []
  const sayfa = 1000
  let off = 0
  while (true) {
    const { data, error } = await supabase.from('gorevler').select(GOREV_LISTE_KOLONLARI).order('olusturma_tarih', { ascending: false }).range(off, off + sayfa - 1)
    if (error) { console.error('gorevleriGetir hata:', error.message); throw error }
    if (!data || data.length === 0) break
    hepsi.push(...data)
    if (data.length < sayfa) break
    off += sayfa
  }
  return arrayToCamel(hepsi)
})

export const gorevGetir = (id) => cached(`gorev:${id}`, async () => {
  const { data } = await supabase.from('gorevler').select('*').eq('id', id).single()
  return toCamel(data)
})

// Boş string tarih PG'de timestamptz/date cast hatası verir ve UPDATE komple
// reddedilir (Elite Garden "güncellenmiyor" vakası, 2026-07-17) — '' → null.
const TARIH_ALANLARI = ['baslamaTarih', 'bitisTarih', 'sonTarih', 'bitisTarihi', 'tamamlanmaTarihi', 'onayTarih', 'devirTarih']
const tarihleriNormallestir = (g) => {
  const out = { ...g }
  for (const k of TARIH_ALANLARI) if (out[k] === '') out[k] = null
  return out
}

export const gorevEkle = async (gorev) => {
  const { id, olusturmaTarih, yorumlar, ...rest } = gorev
  const { data, error } = await supabase.from('gorevler').insert(toSnake(tarihleriNormallestir(rest))).select().single()
  if (error) { console.error('gorevEkle hata:', error.message); return null }
  invalidate('gorevler:list')
  const yeni = toCamel(data)
  // Vekâlet (madde 39): atanan kişi izinliyse vekili de haberdar edilir —
  // görev yine asıl kişiye yazılır, vekil bilgi bildirimi alır (fire-and-forget)
  if (yeni?.atananId) {
    aktifVekaletGetir(yeni.atananId).then(v => {
      if (!v?.vekilId) return
      supabase.rpc('bildirim_ekle', {
        p_alici_id: Number(v.vekilId),
        p_baslik: '🧭 Vekâlet — yeni görev bilgisi',
        p_mesaj: `${yeni.atananAd || 'İzinli personel'} için yeni görev açıldı: "${yeni.baslik}". Vekili olarak bilgilendirildin.`,
        p_tip: 'gorev',
        p_link: `/gorevler/${yeni.id}`,
        p_meta: null,
      }).then(() => {}, () => {})
    }).catch(() => {})
  }
  return yeni
}

export const gorevGuncelle = async (id, guncellenmis) => {
  const { id: _id, olusturmaTarih, ...rest } = guncellenmis
  const { data, error } = await supabase.from('gorevler').update(toSnake(tarihleriNormallestir(rest))).eq('id', id).select().single()
  if (error) { console.error('gorevGuncelle hata:', error.message); return null }
  invalidate('gorevler:list', `gorev:${id}`)
  return toCamel(data)
}

export const gorevSil = async (id) => {
  await supabase.from('gorevler').delete().eq('id', id)
  invalidate('gorevler:list', `gorev:${id}`)
}

// ═══════════════════════════════════════════════════════════════════════════
// Hiyerarşi (alt görevler) — 44 maddelik spek, 2026-07-19
// ═══════════════════════════════════════════════════════════════════════════

// Bir görevin TÜM alt ağacı: gorev_no hiyerarşiyi kodlar (GRV-2026-000145-01-02),
// prefix sorgusu tek istekte bütün torunları getirir.
export const gorevAgaciGetir = async (gorevNo) => {
  if (!gorevNo) return []
  const { data, error } = await supabase.from('gorevler')
    .select(GOREV_LISTE_KOLONLARI)
    .like('gorev_no', `${gorevNo}-%`)
    .order('gorev_no', { ascending: true })
  if (error) { console.error('gorevAgaciGetir hata:', error.message); return [] }
  return arrayToCamel(data || [])
}

export const altGorevleriGetir = async (ustGorevId) => {
  const { data, error } = await supabase.from('gorevler')
    .select(GOREV_LISTE_KOLONLARI)
    .eq('ust_gorev_id', ustGorevId)
    .order('gorev_no', { ascending: true })
  if (error) { console.error('altGorevleriGetir hata:', error.message); return [] }
  return arrayToCamel(data || [])
}

// ═══════════════════════════════════════════════════════════════════════════
// Kabul / ret / devir / onay aksiyonları (madde 11, 14, 38)
// Hepsi gorevGuncelle üzerinden — hareket geçmişini DB trigger'ı yazar.
// ═══════════════════════════════════════════════════════════════════════════

export const gorevGoruldu = (id) => gorevGuncelle(id, { kabulDurumu: 'goruldu' })

export const gorevKabulEt = (id) => gorevGuncelle(id, { kabulDurumu: 'kabul_edildi' })

export const gorevReddet = (id, sebep) =>
  gorevGuncelle(id, { kabulDurumu: 'reddedildi', durum: 'reddedildi', redSebebi: sebep })

// Devir: sorumluluk tamamen geçer; yeni sorumlu yeniden kabul etmeli (madde 38)
export const gorevDevret = (id, { yeniAtananId, devredenId, sebep }) =>
  gorevGuncelle(id, {
    atanan: String(yeniAtananId), atananId: Number(yeniAtananId),
    devredenId: Number(devredenId), devirSebebi: sebep || null,
    devirTarih: new Date().toISOString(),
    kabulDurumu: 'atandi', redSebebi: null,
  })

// Onay akışı (madde 14)
export const gorevOnayaGonder = (id) =>
  gorevGuncelle(id, { durum: 'onay_bekliyor', onayDurumu: 'bekliyor', ilerleme: 100 })

export const gorevOnayla = (id, not_) =>
  gorevGuncelle(id, { durum: 'tamamlandi', onayDurumu: 'onaylandi', onayNotu: not_ || null, onayTarih: new Date().toISOString() })

export const gorevRevizeIste = (id, not_) =>
  gorevGuncelle(id, { durum: 'revize', onayDurumu: 'revize', onayNotu: not_ || null, ilerleme: 90 })

export const gorevOnayReddet = (id, not_) =>
  gorevGuncelle(id, { durum: 'reddedildi', onayDurumu: 'reddedildi', onayNotu: not_ || null })

// ═══════════════════════════════════════════════════════════════════════════
// Kontrol listesi (madde 18)
// ═══════════════════════════════════════════════════════════════════════════

export const kontrolListesiGetir = async (gorevId) => {
  const { data, error } = await supabase.from('gorev_kontrol_listesi')
    .select('*').eq('gorev_id', gorevId).order('sira').order('id')
  if (error) { console.error('kontrolListesiGetir hata:', error.message); return [] }
  return arrayToCamel(data || [])
}

export const kontrolMaddeEkle = async (madde) => {
  const { data, error } = await supabase.from('gorev_kontrol_listesi')
    .insert(toSnake(madde)).select().single()
  if (error) { console.error('kontrolMaddeEkle hata:', error.message); return null }
  return toCamel(data)
}

export const kontrolMaddeGuncelle = async (id, degisiklik) => {
  const { data, error } = await supabase.from('gorev_kontrol_listesi')
    .update(toSnake(degisiklik)).eq('id', id).select().single()
  if (error) { console.error('kontrolMaddeGuncelle hata:', error.message); return null }
  return toCamel(data)
}

export const kontrolMaddeIsaretle = (id, tamamlandi, kullanici) =>
  kontrolMaddeGuncelle(id, {
    tamamlandi,
    tamamlayanId: tamamlandi ? kullanici?.id : null,
    tamamlayanAd: tamamlandi ? kullanici?.ad : null,
    tamamlanmaTarih: tamamlandi ? new Date().toISOString() : null,
  })

export const kontrolMaddeSil = async (id) => {
  const { error } = await supabase.from('gorev_kontrol_listesi').delete().eq('id', id)
  if (error) { console.error('kontrolMaddeSil hata:', error.message); return false }
  return true
}

// ═══════════════════════════════════════════════════════════════════════════
// Hareket geçmişi (madde 23) — salt okunur; yazan DB trigger'ıdır
// ═══════════════════════════════════════════════════════════════════════════

export const gorevHareketleriGetir = async (gorevId) => {
  const { data, error } = await supabase.from('gorev_hareketleri')
    .select('*').eq('gorev_id', gorevId).order('olusturma_tarih', { ascending: true })
  if (error) { console.error('gorevHareketleriGetir hata:', error.message); return [] }
  return arrayToCamel(data || [])
}

// Modül ayarları (madde 8 — max alt görev seviyesi; admin değiştirir)
export const gorevAyarlariGetir = async () => {
  const { data } = await supabase.from('gorev_ayarlar').select('*').eq('id', 1).maybeSingle()
  return toCamel(data) || { maxAltSeviye: 5 }
}

export const gorevAyarlariGuncelle = async (degisiklik, kullaniciId) => {
  const { data, error } = await supabase.from('gorev_ayarlar')
    .update(toSnake({ ...degisiklik, guncelleyenId: kullaniciId, guncellemeTarih: new Date().toISOString() }))
    .eq('id', 1).select().single()
  if (error) { console.error('gorevAyarlariGuncelle hata:', error.message); return null }
  return toCamel(data)
}

// Alt görevler dahil tüm ağacın hareketleri (detay ekranı zaman çizelgesi)
export const gorevHareketleriTopluGetir = async (gorevIdler) => {
  if (!gorevIdler?.length) return []
  const { data, error } = await supabase.from('gorev_hareketleri')
    .select('*').in('gorev_id', gorevIdler).order('olusturma_tarih', { ascending: true })
  if (error) { console.error('gorevHareketleriTopluGetir hata:', error.message); return [] }
  return arrayToCamel(data || [])
}

// ═══════════════════════════════════════════════════════════════════════════
// Şablonlar (madde 29) — mig 196
// ═══════════════════════════════════════════════════════════════════════════

export const gorevSablonlariGetir = async () => {
  const { data, error } = await supabase.from('gorev_sablonlari')
    .select('*').eq('aktif', true).order('ad')
  if (error) { console.error('gorevSablonlariGetir hata:', error.message); return [] }
  return arrayToCamel(data || [])
}

export const gorevSablonKaydet = async (sablon) => {
  const { data, error } = await supabase.from('gorev_sablonlari')
    .insert(toSnake(sablon)).select().single()
  if (error) { console.error('gorevSablonKaydet hata:', error.message); return null }
  return toCamel(data)
}

export const gorevSablonSil = async (id) => {
  const { error } = await supabase.from('gorev_sablonlari').update({ aktif: false }).eq('id', id)
  return !error
}

// ═══════════════════════════════════════════════════════════════════════════
// Tekrarlayan görevler (madde 28) — üretimi gorev-gunluk-tara cron'u yapar
// ═══════════════════════════════════════════════════════════════════════════

export const gorevTekrarlariGetir = async () => {
  const { data, error } = await supabase.from('gorev_tekrarlar').select('*').order('ad')
  if (error) { console.error('gorevTekrarlariGetir hata:', error.message); return [] }
  return arrayToCamel(data || [])
}

export const gorevTekrarKaydet = async (tekrar) => {
  const { data, error } = await supabase.from('gorev_tekrarlar')
    .insert(toSnake(tekrar)).select().single()
  if (error) { console.error('gorevTekrarKaydet hata:', error.message); return null }
  return toCamel(data)
}

export const gorevTekrarGuncelle = async (id, degisiklik) => {
  const { data, error } = await supabase.from('gorev_tekrarlar')
    .update(toSnake(degisiklik)).eq('id', id).select().single()
  if (error) { console.error('gorevTekrarGuncelle hata:', error.message); return null }
  return toCamel(data)
}

// ═══════════════════════════════════════════════════════════════════════════
// Vekâlet (madde 39) — mig 196
// ═══════════════════════════════════════════════════════════════════════════

export const vekaletleriGetir = async () => {
  const { data, error } = await supabase.from('gorev_vekaletler')
    .select('*').order('aktif', { ascending: false }).order('baslangic', { ascending: false })
  if (error) { console.error('vekaletleriGetir hata:', error.message); return [] }
  return arrayToCamel(data || [])
}

// Kişinin BUGÜN geçerli vekâleti (görev atarken kontrol edilir)
export const aktifVekaletGetir = async (kullaniciId) => {
  if (!kullaniciId) return null
  const bugun = new Date().toISOString().slice(0, 10)
  const { data } = await supabase.from('gorev_vekaletler')
    .select('*').eq('kullanici_id', kullaniciId).eq('aktif', true)
    .lte('baslangic', bugun)
    .or(`bitis.is.null,bitis.gte.${bugun}`)
    .limit(1).maybeSingle()
  return toCamel(data)
}

export const vekaletKaydet = async (vekalet) => {
  const { data, error } = await supabase.from('gorev_vekaletler')
    .insert(toSnake(vekalet)).select().single()
  if (error) { console.error('vekaletKaydet hata:', error.message); return null }
  return toCamel(data)
}

export const vekaletKapat = async (id) => {
  const { error } = await supabase.from('gorev_vekaletler').update({ aktif: false }).eq('id', id)
  return !error
}
