// Müşteri Cihaz Envanteri — müşteriye ait cihazlar (SN, IP, MAC, kimlik bilgileri).
// Teknisyen sahada SN okutup arızalı giriş yapabilir; MusteriDetay'dan takip edilir.
import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel } from '../lib/mapper'

export const CIHAZ_DURUMLARI = [
  { id: 'aktif',    isim: 'Aktif',    renk: '#10b981' },
  { id: 'arizali',  isim: 'Arızalı',  renk: '#dc2626' },
  { id: 'serviste', isim: 'Serviste', renk: '#f59e0b' },
  { id: 'hurda',    isim: 'Hurda',    renk: '#6b7280' },
]

const toDb = (c) => {
  const map = {
    musteriId: 'musteri_id', lokasyon: 'lokasyon', cihazAdi: 'cihaz_adi',
    marka: 'marka', model: 'model', seriNo: 'seri_no',
    ipAdresi: 'ip_adresi', macAdresi: 'mac_adresi',
    kullaniciAdi: 'kullanici_adi', sifre: 'sifre',
    durum: 'durum', arizaNedeni: 'ariza_nedeni', arizaTarihi: 'ariza_tarihi',
    notlar: 'notlar', olusturanId: 'olusturan_id', olusturanAd: 'olusturan_ad',
  }
  const r = {}
  for (const [camel, snake] of Object.entries(map)) {
    if (c[camel] !== undefined) r[snake] = c[camel] === '' ? null : c[camel]
  }
  return r
}

export const musteriCihazlariGetir = async (musteriId) => {
  const { data, error } = await supabase
    .from('musteri_cihazlari').select('*')
    .eq('musteri_id', musteriId)
    .order('guncelleme_tarih', { ascending: false })
  if (error) { console.error('[musteriCihazlariGetir]', error.message); return [] }
  return arrayToCamel(data)
}

// SN ile global arama (arızalı girişte "bu cihaz kayıtlı mı?")
export const cihazGetirSeriNo = async (seriNo) => {
  const { data, error } = await supabase
    .from('musteri_cihazlari').select('*')
    .ilike('seri_no', String(seriNo).trim())
    .maybeSingle()
  if (error) { console.error('[cihazGetirSeriNo]', error.message); return null }
  return data ? toCamel(data) : null
}

const hareketYaz = async (cihazId, tip, aciklama, yapan) => {
  await supabase.from('musteri_cihaz_hareketleri').insert({
    cihaz_id: cihazId, tip, aciklama: aciklama || null,
    yapan_id: yapan?.id ?? null, yapan_ad: yapan?.ad ?? null,
  })
}

export const cihazEkle = async (cihaz, yapan) => {
  const { data, error } = await supabase
    .from('musteri_cihazlari')
    .insert(toDb({ ...cihaz, olusturanId: yapan?.id, olusturanAd: yapan?.ad }))
    .select().single()
  if (error) {
    const mesaj = /ux_musteri_cihaz_sn|duplicate/i.test(error.message)
      ? 'Bu seri numarası zaten kayıtlı.' : error.message
    return { hata: mesaj }
  }
  await hareketYaz(data.id, 'olusturuldu',
    cihaz.durum === 'arizali' ? `Arızalı giriş: ${cihaz.arizaNedeni || ''}` : 'Cihaz kaydedildi', yapan)
  return { cihaz: toCamel(data) }
}

export const cihazGuncelle = async (id, patch, yapan, hareketNotu) => {
  const { data, error } = await supabase
    .from('musteri_cihazlari').update(toDb(patch)).eq('id', id).select().single()
  if (error) { console.error('[cihazGuncelle]', error.message); return null }
  await hareketYaz(id, 'guncelleme', hareketNotu || 'Bilgiler güncellendi', yapan)
  return toCamel(data)
}

export const cihazArizaBildir = async (id, neden, yapan) => {
  const { data, error } = await supabase
    .from('musteri_cihazlari')
    .update({ durum: 'arizali', ariza_nedeni: neden || null, ariza_tarihi: new Date().toISOString() })
    .eq('id', id).select().single()
  if (error) { console.error('[cihazArizaBildir]', error.message); return null }
  await hareketYaz(id, 'ariza', neden, yapan)
  return toCamel(data)
}

export const cihazArizaGiderildi = async (id, aciklama, yapan) => {
  const { data, error } = await supabase
    .from('musteri_cihazlari')
    .update({ durum: 'aktif', ariza_nedeni: null })
    .eq('id', id).select().single()
  if (error) { console.error('[cihazArizaGiderildi]', error.message); return null }
  await hareketYaz(id, 'tamir', aciklama || 'Arıza giderildi', yapan)
  return toCamel(data)
}

export const cihazSil = async (id) => {
  const { error } = await supabase.from('musteri_cihazlari').delete().eq('id', id)
  if (error) { console.error('[cihazSil]', error.message); return false }
  return true
}

export const cihazHareketleriGetir = async (cihazId) => {
  const { data, error } = await supabase
    .from('musteri_cihaz_hareketleri').select('*')
    .eq('cihaz_id', cihazId).order('tarih', { ascending: false }).limit(50)
  if (error) { console.error('[cihazHareketleri]', error.message); return [] }
  return arrayToCamel(data)
}
