// Toplu Bakım Operasyonu — servis katmanı (mig 233).
// Kural: bir müşteri + bir lokasyon + bir saha ziyareti = bir toplu bakım iş emri.
// TB no + alt kalem no'ları DB trigger'ı atar (istemci ÜRETMEZ — belge-no kuralı).

import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'

// ── Sabitler ────────────────────────────────────────────────────────────────

export const BAKIM_KALEMLERI = {
  cctv:         { isim: 'CCTV / IP Kamera', ikon: '📹', renk: '#3b82f6' },
  turnike:      { isim: 'Turnike / PDKS',   ikon: '🚪', renk: '#22c55e' },
  ekran_led:    { isim: 'Ekran / LED',      ikon: '🖥️', renk: '#8b5cf6' },
  fiber:        { isim: 'Fiber',            ikon: '🔌', renk: '#f59e0b' },
  hirsiz_alarm: { isim: 'Hırsız Alarm',     ikon: '🚨', renk: '#ef4444' },
  sistem_odasi: { isim: 'Sistem Odası',     ikon: '🗄️', renk: '#06b6d4' },
}

export const kalemBilgi = (tip) =>
  BAKIM_KALEMLERI[tip] ?? { isim: tip, ikon: '🔧', renk: '#94a3b8' }

// Ana iş durumları (spec madde 27)
export const TB_DURUMLAR = {
  planlandi:            { isim: 'Planlandı',             renk: '#94a3b8' },
  atandi:               { isim: 'Personele Atandı',      renk: '#3b82f6' },
  yola_cikildi:         { isim: 'Yola Çıkıldı',          renk: '#f59e0b' },
  lokasyona_ulasildi:   { isim: 'Lokasyona Ulaşıldı',    renk: '#f59e0b' },
  bakim_basladi:        { isim: 'Bakım Başladı',         renk: '#8b5cf6' },
  devam_ediyor:         { isim: 'Devam Ediyor',          renk: '#8b5cf6' },
  eksik_bakim:          { isim: 'Eksik Bakım',           renk: '#ef4444' },
  imza_bekleniyor:      { isim: 'İmza Bekleniyor',       renk: '#eab308' },
  tamamlandi:           { isim: 'Tamamlandı',            renk: '#22c55e' },
  yonetici_kontrolunde: { isim: 'Yönetici Kontrolünde',  renk: '#06b6d4' },
  musteriye_gonderildi: { isim: 'Müşteriye Gönderildi',  renk: '#10b981' },
  iptal:                { isim: 'İptal Edildi',          renk: '#64748b' },
}

export const tbDurumBilgi = (d) => TB_DURUMLAR[d] ?? { isim: d ?? '—', renk: '#94a3b8' }

// Kalem durumları (spec madde 14)
export const KALEM_DURUMLAR = {
  baslanmadi:   { isim: 'Başlanmadı',      renk: '#94a3b8' },
  devam_ediyor: { isim: 'Devam Ediyor',    renk: '#3b82f6' },
  tamamlandi:   { isim: 'Tamamlandı',      renk: '#22c55e' },
  ariza_tespit: { isim: 'Arıza Tespit',    renk: '#ef4444' },
  yapilamadi:   { isim: 'Bakım Yapılamadı', renk: '#f59e0b' },
}

export const kalemDurumBilgi = (d) => KALEM_DURUMLAR[d] ?? { isim: d ?? '—', renk: '#94a3b8' }

// Bakım yapılamama sebepleri (spec madde 16)
export const YAPILAMADI_SEBEPLERI = [
  'Sisteme erişim sağlanamadı',
  'Müşteri izin vermedi',
  'Sistem kullanımdaydı',
  'Elektrik bulunmuyordu',
  'Yetkili kişi bulunamadı',
  'Sistem lokasyonda bulunamadı',
  'Diğer',
]

// HDD kapasite seçenekleri (spec 8.5)
export const HDD_KAPASITELERI = ['1 TB', '2 TB', '4 TB', '6 TB', '8 TB', '10 TB', '12 TB', '14 TB', '16 TB', '18 TB', '20 TB', 'Diğer']

// Kayıt cihazı türleri (spec 8.1)
export const KAYIT_CIHAZI_TURLERI = ['NVR', 'Sunucu', 'NVR ve Sunucu', 'DVR', 'Hibrit', 'Diğer']

// Saat/tarih kontrol seçenekleri (spec 8.3)
export const SAAT_TARIH_SECENEKLERI = {
  guncel:            'Güncel',
  duzeltildi:        'Güncel değildi, düzeltildi',
  guncel_degil:      'Güncel değil',
  kontrol_edilemedi: 'Kontrol edilemedi',
}

// ── Yetki ───────────────────────────────────────────────────────────────────
// Bakım işini yalnız saha sorumlusu açar: admin rolü VEYA saha_sorumlusu bayrağı
// (Ferdi 33, Salih 34, Mahmut 45 — mig 233; DB RLS aynı kuralı uygular).
export const sahaSorumlusuMu = (kullanici) =>
  !!kullanici && (kullanici.rol === 'admin' || kullanici.sahaSorumlusu === true)

// ── CRUD ────────────────────────────────────────────────────────────────────

const TB_LISTE_KOLONLARI = `
  id, tb_no, musteri_id, lokasyon_id, lokasyon_adi, lokasyon_adres,
  bakim_donemi, planlanan_tarih, planlanan_saat, teknik_personel_id, ekip_ids,
  durum, oncelik, olusturan_id, olusturma_tarih,
  musteriler ( firma ),
  toplu_bakim_kalemleri ( id, kalem_tip, durum, ariza_var )
`

export const topluBakimlariGetir = async ({ durum } = {}) => {
  let q = supabase
    .from('toplu_bakimlar')
    .select(TB_LISTE_KOLONLARI)
    .order('olusturma_tarih', { ascending: false })
  if (durum && durum !== 'tumu') q = q.eq('durum', durum)
  const { data, error } = await q
  if (error) { console.error('[topluBakim] liste:', error.message); return [] }
  // toCamel shallow join dersi: iç içe alanları elle düzleştir
  return (data || []).map((r) => ({
    ...toCamel(r),
    musteriFirma: r.musteriler?.firma ?? null,
    kalemler: arrayToCamel(r.toplu_bakim_kalemleri || []),
  }))
}

export const topluBakimGetir = async (id) => {
  const { data, error } = await supabase
    .from('toplu_bakimlar')
    .select('*, musteriler ( firma ), toplu_bakim_kalemleri ( * )')
    .eq('id', id)
    .single()
  if (error) { console.error('[topluBakim] detay:', error.message); return null }
  return {
    ...toCamel(data),
    musteriFirma: data.musteriler?.firma ?? null,
    kalemler: arrayToCamel(data.toplu_bakim_kalemleri || [])
      .sort((a, b) => a.id - b.id),
  }
}

// Ana iş + seçilen kalemleri birlikte oluşturur.
export const topluBakimOlustur = async ({ kalemTipleri, ...alanlar }) => {
  if (!kalemTipleri?.length) return { hata: 'En az bir bakım kalemi seçilmeli.' }
  const { data: tb, error } = await supabase
    .from('toplu_bakimlar')
    .insert(toSnake(alanlar))
    .select()
    .single()
  if (error) { console.error('[topluBakim] olustur:', error.message); return { hata: error.message } }

  const { error: eK } = await supabase
    .from('toplu_bakim_kalemleri')
    .insert(kalemTipleri.map((tip) => ({ toplu_bakim_id: tb.id, kalem_tip: tip })))
  if (eK) {
    // Kalem yazılamazsa yarım iş bırakma — ana kaydı geri al
    await supabase.from('toplu_bakimlar').delete().eq('id', tb.id)
    console.error('[topluBakim] kalemler:', eK.message)
    return { hata: 'Bakım kalemleri oluşturulamadı: ' + eK.message }
  }
  return toCamel(tb)
}

export const topluBakimGuncelle = async (id, patch) => {
  const { data, error } = await supabase
    .from('toplu_bakimlar')
    .update(toSnake(patch))
    .eq('id', id)
    .select()
    .single()
  if (error) { console.error('[topluBakim] guncelle:', error.message); return null }
  return toCamel(data)
}

// Kalıcı silme — yalnız saha sorumlusu (RLS de korur); kalemler CASCADE gider.
export const topluBakimSil = async (id) => {
  const { error } = await supabase.from('toplu_bakimlar').delete().eq('id', id)
  if (error) { console.error('[topluBakim] sil:', error.message); return { hata: error.message } }
  return { ok: true }
}

// Sonradan kalem ekleme (spec madde 15) — yalnız saha sorumlusu (RLS de korur).
export const topluBakimKalemEkle = async (topluBakimId, kalemTip) => {
  const { data, error } = await supabase
    .from('toplu_bakim_kalemleri')
    .insert({ toplu_bakim_id: topluBakimId, kalem_tip: kalemTip })
    .select()
    .single()
  if (error) { console.error('[topluBakim] kalem ekle:', error.message); return null }
  return toCamel(data)
}

// Tamamlanmamış kalem silme (spec: tamamlanmış kalem SİLİNEMEZ — uygulama kuralı).
export const topluBakimKalemSil = async (kalem) => {
  if (kalem?.durum === 'tamamlandi') return { hata: 'Tamamlanmış bakım kalemi silinemez.' }
  const { error } = await supabase
    .from('toplu_bakim_kalemleri')
    .delete()
    .eq('id', kalem.id)
  if (error) { console.error('[topluBakim] kalem sil:', error.message); return { hata: error.message } }
  return { ok: true }
}

export const topluBakimKalemGuncelle = async (id, patch) => {
  const { data, error } = await supabase
    .from('toplu_bakim_kalemleri')
    .update(toSnake(patch))
    .eq('id', id)
    .select()
    .single()
  if (error) { console.error('[topluBakim] kalem guncelle:', error.message); return null }
  return toCamel(data)
}

// Lokasyonun "bulunan sistemler" bilgisini güncelle (spec madde 4)
export const lokasyonSistemleriGuncelle = async (lokasyonId, sistemler) => {
  const { error } = await supabase
    .from('musteri_lokasyonlari')
    .update({ bulunan_sistemler: sistemler })
    .eq('id', lokasyonId)
  if (error) console.error('[topluBakim] lokasyon sistemleri:', error.message)
  return !error
}
