// Satış Sözleşmesi Otomasyon Modülü servisi (mig 156).
// Akış (spec §8): taslak → yönetici onayına gönder → onayla (KİLİTLENİR) →
// müşteriye gönder → imzalı PDF yüklenir → bağlı sipariş "Sözleşmeli Sipariş" olur.

import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'
import { cokluBildirimEkle } from './bildirimService'
import { sozlesmeHesapla } from '../lib/satisSozlesmeHesap'
import { sozlesmeHtmlUret, evrakListesiUret } from '../lib/satisSozlesmeMaddeleri'

export const satisSozlesmeleriGetir = async () => {
  const { data, error } = await supabase
    .from('satis_sozlesmeleri').select('*').order('id', { ascending: false })
  if (error) { console.error('satisSozlesmeleriGetir hata:', error.message); return [] }
  return arrayToCamel(data || [])
}

export const satisSozlesmeGetir = async (id) => {
  const { data, error } = await supabase
    .from('satis_sozlesmeleri').select('*').eq('id', id).single()
  if (error) { console.error('satisSozlesmeGetir hata:', error.message); return null }
  return toCamel(data)
}

export const satisSozlesmeEkle = async (payload) => {
  const { data, error } = await supabase
    .from('satis_sozlesmeleri').insert(toSnake(payload)).select().single()
  if (error) return { _hata: error.message }
  return toCamel(data)
}

export const satisSozlesmeGuncelle = async (id, patch) => {
  const { data, error } = await supabase
    .from('satis_sozlesmeleri')
    .update({ ...toSnake(patch), guncelleme_tarih: new Date().toISOString() })
    .eq('id', id).select().single()
  if (error) return { _hata: error.message }
  return toCamel(data)
}

// Hesapları uygula + içerik HTML'ini üret (kayıt öncesi tek noktadan)
export const hesapVeIcerikHazirla = (form) => {
  const hesap = sozlesmeHesapla(form)
  const evraklar = form.evraklar?.length
    ? form.evraklar
    : evrakListesiUret({ firmaTipi: form.firmaTipi, odemeTipi: form.odemeTipi, imzaBelgesiIstenir: form.imzaBelgesiIstenir })
  // Logo göreli tutulur — uygulama içinde doğrudan, yazdırma penceresinde <base> ile çözülür
  const icerik = sozlesmeHtmlUret({ ...form, ...hesap, evraklar }, { logoUrl: '/logo.jpeg' })
  return { ...hesap, evraklar, uretilenIcerik: icerik }
}

// ---------- Durum geçişleri ----------

export const onayaGonder = async (sozlesme, kullanici) => {
  const g = await satisSozlesmeGuncelle(sozlesme.id, {
    durum: 'yonetici_onayinda',
    onayaGonderimTarihi: new Date().toISOString(),
    redSebebi: null,
  })
  if (g?._hata) return g
  bildirimGonder(null, 'Satış sözleşmesi onay bekliyor',
    `${sozlesme.sozlesmeNo} — ${sozlesme.firmaAdi || ''} (${kullanici?.ad || 'personel'} hazırladı). Oran, vade ve iskonto kontrolü gerekiyor.`)
  return g
}

// Yönetici onayı: sözleşme KİLİTLENİR (spec §8/5)
export const sozlesmeOnayla = async (sozlesme, kullanici) => {
  const g = await satisSozlesmeGuncelle(sozlesme.id, {
    durum: 'onaylandi',
    kilitli: true,
    onaylayanId: kullanici?.id || null,
    onaylayanAd: kullanici?.ad || null,
    onayTarihi: new Date().toISOString(),
  })
  if (g?._hata) return g
  bildirimGonder(sozlesme.hazirlayanId, 'Satış sözleşmesi onaylandı',
    `${sozlesme.sozlesmeNo} yönetici tarafından onaylandı ve kilitlendi. Müşteriye gönderebilirsiniz.`)
  return g
}

export const sozlesmeReddet = async (sozlesme, kullanici, sebep) => {
  const g = await satisSozlesmeGuncelle(sozlesme.id, {
    durum: 'taslak', kilitli: false, redSebebi: sebep || null,
  })
  if (g?._hata) return g
  bildirimGonder(sozlesme.hazirlayanId, 'Satış sözleşmesi reddedildi',
    `${sozlesme.sozlesmeNo} — ${kullanici?.ad || 'yönetici'}: ${sebep || 'sebep belirtilmedi'}`)
  return g
}

export const gonderildiIsaretle = (id) => satisSozlesmeGuncelle(id, {
  durum: 'gonderildi', gonderimTarihi: new Date().toISOString(),
})

export const sozlesmeIptalEt = (id) => satisSozlesmeGuncelle(id, { durum: 'iptal', kilitli: false })

// Kilidi aç (yalnız admin çağırır) — revizyon için taslağa döner
export const kilidiAc = (id) => satisSozlesmeGuncelle(id, {
  durum: 'taslak', kilitli: false,
})

// ---------- Dosyalar (satis-sozlesme bucket) ----------

export const ssDosyaYukle = async (sozlesmeId, file, prefix) => {
  const uzanti = (file.name.split('.').pop() || 'pdf').toLowerCase()
  const path = `${sozlesmeId}/${prefix}-${Date.now()}.${uzanti}`
  const { error } = await supabase.storage.from('satis-sozlesme').upload(path, file)
  if (error) { console.error('ssDosyaYukle hata:', error.message); return null }
  return path
}

export const ssDosyaUrl = async (path) => {
  const { data, error } = await supabase.storage.from('satis-sozlesme').createSignedUrl(path, 3600)
  if (error) { console.error('ssDosyaUrl hata:', error.message); return null }
  return data?.signedUrl || null
}

// İmzalı sözleşme (PDF zorunlu) → durum imzalandi + bağlı sipariş "Sözleşmeli Sipariş"
export const imzaliSozlesmeYukleSS = async ({ sozlesme, file }) => {
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
    return { _hata: 'İmzalı sözleşme yalnızca PDF olarak yüklenebilir.' }
  }
  const path = await ssDosyaYukle(sozlesme.id, file, 'imzali')
  if (!path) return { _hata: 'Dosya yüklenemedi.' }
  const g = await satisSozlesmeGuncelle(sozlesme.id, {
    imzaliPdfUrl: path, imzaliPdfAd: file.name,
    durum: 'imzalandi', imzaTarihi: new Date().toISOString(),
    kurFarkiDurumu: sozlesme.kurFarkiUygulanir && sozlesme.kurFarkiDurumu === 'yok' ? 'izleniyor' : sozlesme.kurFarkiDurumu,
  })
  if (g?._hata) return g
  if (sozlesme.siparisId) {
    await supabase.from('siparisler').update({ sozlesme_id: sozlesme.id }).eq('id', sozlesme.siparisId)
  }
  return g
}

// ---------- Kur farkı takibi (spec §10) ----------

export const kurFarkiKaydet = async (id, { tahsilKuru, kurFarkiTl, durum }) =>
  satisSozlesmeGuncelle(id, { tahsilKuru, kurFarkiTl, kurFarkiDurumu: durum })

// ---------- Kaynaktan veri hazırlama ----------

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

// Firma tipini unvandan tahmin et — kullanıcı yine de değiştirebilir
export const firmaTipiTahmin = (firmaAdi) => {
  const s = (firmaAdi || '').toLocaleLowerCase('tr')
  if (/a\.?\s?ş\.?|anonim/.test(s)) return 'anonim'
  if (/ltd|limited|şti/.test(s)) return 'limited'
  if (/belediye|bakanlık|müdürlüğ|kaymakam|valilik|üniversite/.test(s)) return 'kamu'
  if (/vakf|vakıf/.test(s)) return 'vakif'
  if (/derneğ|dernek/.test(s)) return 'dernek'
  return null
}

// Müşteri kartındaki firma künyesi (vergi no, vergi dairesi, adres, iletişim).
// Teklif/sipariş kaydı bunları tutmuyor — sözleşmede elle doldurulmasın diye
// müşteriden taşınır. Boş alanlar mevcut form değerini EZMEZ.
export const musteridenKunye = (musteri) => {
  if (!musteri) return {}
  const dolu = (v) => (typeof v === 'string' ? v.trim() : v) || null
  const adres = [dolu(musteri.adres), dolu(musteri.sehir)].filter(Boolean).join(' · ')
  const kunye = {
    tcVergiNo:    dolu(musteri.vergiNo),
    vergiDairesi: dolu(musteri.vergiDairesi),
    adres:        adres || null,
    telefon:      dolu(musteri.telefon),
    email:        dolu(musteri.email),
    firmaAdi:     dolu(musteri.firma),
    yetkiliAdi:   [musteri.ad, musteri.soyad].filter(Boolean).join(' ').trim() || null,
    firmaTipi:    firmaTipiTahmin(musteri.firma),
  }
  // null olanları at — spread edilirken dolu alanları silmesin
  return Object.fromEntries(Object.entries(kunye).filter(([, v]) => v !== null))
}

// Teklif → sözleşme form alanları (genel_toplam KDV DAHİLDİR — TeklifDetay hesabı)
export const tekliftenForm = (teklif, gorusmeNo) => ({
  musteriId: teklif.musteriId || null,
  teklifId: teklif.id, teklifNo: teklif.teklifNo || '',
  gorusmeNo: gorusmeNo || '',
  firmaAdi: teklif.firmaAdi || '',
  yetkiliAdi: teklif.musteriYetkilisi || '',
  isinKonusu: teklif.konu || '',
  paraBirimi: ['TL', 'USD', 'EUR'].includes(teklif.paraBirimi) ? teklif.paraBirimi : 'TL',
  anaToplam: r2(teklif.genelToplam),
  urunListesi: (teklif.satirlar || []).map(s => ({
    stokKodu: s.stokKodu || '',
    urunAdi: s.stokAdi || s.aciklama || '',
    miktar: Number(s.miktar) || 0,
    birim: s.birim || 'Adet',
    birimFiyat: Number(s.birimFiyat) || 0,
    toplam: r2((Number(s.miktar) || 0) * (Number(s.birimFiyat) || 0) * (1 - (Number(s.iskonto) || 0) / 100) * (1 + (Number(s.kdv) || 0) / 100)),
  })),
})

// Sipariş → sözleşme form alanları
export const siparistenForm = (siparis, kalemler, musteri) => ({
  musteriId: siparis.musteriId || null,
  // siparisNo forma taşınmaz — alan kaldırıldı; siparisId bağlantı için kalıyor
  siparisId: siparis.id,
  teklifId: siparis.teklifId || null,
  firmaAdi: musteri?.firma || '',
  yetkiliAdi: [musteri?.ad, musteri?.soyad].filter(Boolean).join(' '),
  telefon: musteri?.telefon || '', email: musteri?.email || '',
  isinKonusu: siparis.konu || '',
  paraBirimi: ['TL', 'USD', 'EUR'].includes(siparis.paraBirimi) ? siparis.paraBirimi : 'TL',
  anaToplam: r2(siparis.genelToplam),
  urunListesi: (kalemler || []).map(k => ({
    stokKodu: k.stokKodu || '',
    urunAdi: k.urunAd || k.aciklama || '',
    miktar: Number(k.miktar) || 0,
    birim: k.birim || 'Adet',
    birimFiyat: Number(k.birimFiyat) || 0,
    toplam: r2((Number(k.araToplam) || 0) * (1 + (Number(k.kdvOrani) || 0) / 100)),
  })),
})

// ---------- Bildirim (best-effort) ----------

const bildirimGonder = async (aliciId, baslik, mesaj) => {
  try {
    const { data: adminler } = await supabase.from('kullanicilar').select('id').eq('rol', 'admin')
    const alicilar = new Set((adminler || []).map(a => a.id))
    if (aliciId) alicilar.add(Number(aliciId))
    if (!alicilar.size) return
    await cokluBildirimEkle([...alicilar], { baslik, mesaj, tip: 'bilgi', link: '/sozlesmeler' })
  } catch (e) {
    console.error('ss bildirim hata:', e?.message)
  }
}
