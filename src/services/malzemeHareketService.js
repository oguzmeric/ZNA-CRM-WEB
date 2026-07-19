// Kullanılan Malzeme & Faturalama Takip (madde 23) — malzeme_hareketleri servisi.
// Kayıtlar sipariş kalemi / servis malzemesi trigger'larından otomatik gelir
// (mig 192); manuel/demo/numune buradan elle eklenir. Kayıt SİLİNMEZ — aktif=false.

import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'
import { faturaTalebiEkle } from './faturaTalepService'
import { musteriGetir } from './musteriService'

// 23.5 + 23.12 — durum meta (isim, renk, grup)
export const FATURA_DURUM = {
  fatura_bekliyor:        { isim: 'Fatura Bekliyor',          renk: '#ef4444', grup: 'kesilmemis' },
  faturaya_hazir:         { isim: 'Faturaya Hazır',           renk: '#ef4444', grup: 'kesilmemis' },
  proforma_hazirlandi:    { isim: 'Proforma Hazırlandı',      renk: '#f97316', grup: 'proforma' },
  proforma_gonderildi:    { isim: 'Proforma Gönderildi',      renk: '#f97316', grup: 'proforma' },
  musteri_onayi_bekleniyor:{ isim: 'Müşteri Onayı Bekleniyor', renk: '#a855f7', grup: 'proforma' },
  kismen_faturalandi:     { isim: 'Kısmen Faturalandı',       renk: '#eab308', grup: 'kismen' },
  faturalandi:            { isim: 'Faturası Kesildi',         renk: '#10b981', grup: 'faturalandi' },
  fatura_iptal:           { isim: 'Fatura İptal Edildi',      renk: '#ef4444', grup: 'kesilmemis' },
  ucretsiz:               { isim: 'Ücretsiz',                 renk: '#94a3b8', grup: 'kapali' },
  garanti:                { isim: 'Garanti Kapsamında',       renk: '#3b82f6', grup: 'kapali' },
  demo_numune:            { isim: 'Demo / Numune',            renk: '#94a3b8', grup: 'kapali' },
  iade:                   { isim: 'İade Edildi',              renk: '#94a3b8', grup: 'kapali' },
  faturalandirilmayacak:  { isim: 'Faturalandırılmayacak',    renk: '#94a3b8', grup: 'kapali' },
}

// Açıklama girilmesi ZORUNLU durumlar (23.5)
export const ACIKLAMA_ZORUNLU = ['ucretsiz', 'garanti', 'demo_numune', 'faturalandirilmayacak']
// Yalnız yönetici onayıyla seçilebilen durum (23.9/23.18)
export const YONETICI_ONAYLI = ['faturalandirilmayacak']
// "Fatura bekliyor" sayılan durumlar (süre takibi + bekleyen tutar)
export const BEKLEYEN_DURUMLAR = [
  'fatura_bekliyor', 'faturaya_hazir', 'proforma_hazirlandi',
  'proforma_gonderildi', 'musteri_onayi_bekleniyor', 'kismen_faturalandi', 'fatura_iptal',
]

export const KAYNAK_META = {
  siparis:          { isim: 'Sipariş',          renk: '#3b82f6' },
  servis:           { isim: 'Servis',           renk: '#f59e0b' },
  on_siparis:       { isim: 'Ön Sipariş',       renk: '#8b5cf6' },
  manuel:           { isim: 'Manuel Teslim',    renk: '#64748b' },
  demo:             { isim: 'Demo',             renk: '#64748b' },
  numune:           { isim: 'Numune',           renk: '#64748b' },
  garanti_degisim:  { isim: 'Garanti Değişimi', renk: '#3b82f6' },
  ucretli_degisim:  { isim: 'Ücretli Değişim',  renk: '#f59e0b' },
}

const KOLONLAR = '*'

export const hareketleriGetir = async () => {
  const hepsi = []
  const sayfa = 1000
  let off = 0
  while (true) {
    const { data, error } = await supabase
      .from('malzeme_hareketleri')
      .select(KOLONLAR)
      .eq('aktif', true)
      .order('olusturma_tarih', { ascending: false })
      .range(off, off + sayfa - 1)
    if (error) { console.error('[malzemeHareket] liste:', error.message); throw error }
    if (!data?.length) break
    hepsi.push(...data)
    if (data.length < sayfa) break
    off += sayfa
  }
  return arrayToCamel(hepsi)
}

// İşlem geçmişi girdisi — kim/ne zaman/ne yaptı (23.16)
const gecmisGirdisi = (islem, detay, kullanici) => ({
  t: new Date().toISOString(),
  islem,
  detay,
  kim: kullanici?.ad || '',
})

// Durum / alan güncelle + işlem geçmişine yaz.
// hareket: eldeki satır (islemGecmisi dahil), patch: camelCase alanlar.
export const hareketGuncelle = async (hareket, patch, islemDetay, kullanici) => {
  const gecmis = [
    ...(Array.isArray(hareket.islemGecmisi) ? hareket.islemGecmisi : []),
    gecmisGirdisi(patch.faturaDurumu ? 'durum' : 'guncelleme', islemDetay, kullanici),
  ]
  const { data, error } = await supabase
    .from('malzeme_hareketleri')
    .update({ ...toSnake(patch), islem_gecmisi: gecmis })
    .eq('id', hareket.id)
    .select()
    .single()
  if (error) { console.error('[malzemeHareket] güncelle:', error.message); throw error }
  return toCamel(data)
}

// Manuel / demo / numune teslimi elle ekle (23.1-3)
export const manuelHareketEkle = async (payload, kullanici) => {
  const { data, error } = await supabase
    .from('malzeme_hareketleri')
    .insert({
      ...toSnake(payload),
      islemi_yapan: kullanici?.ad || null,
      islem_gecmisi: [gecmisGirdisi('olusturuldu', `Elle eklendi (${KAYNAK_META[payload.kaynak]?.isim || payload.kaynak})`, kullanici)],
    })
    .select()
    .single()
  if (error) { console.error('[malzemeHareket] ekle:', error.message); throw error }
  return toCamel(data)
}

// Seçili hareketlerden PROFORMA aç (madde 23.7/23.14) — "Faturaya Gönder".
// Kurallar: hepsi AYNI müşteri + aynı para birimi + bekleyen durumda + fiyatı dolu.
// Başarıda hareketler 'proforma_hazirlandi' olur; Abdullah'a bildirim/SMS
// faturaTalebiEkle içinden otomatik gider.
export const hareketlerdenProformaAc = async (hareketler, kullanici) => {
  const r2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100

  if (!hareketler?.length) throw new Error('Kayıt seçilmedi.')
  const musteriIdler = [...new Set(hareketler.map(h => h.musteriId ?? null))]
  if (musteriIdler.length > 1 || musteriIdler[0] == null) {
    throw new Error('Farklı müşterilere ait ürünler aynı faturaya eklenemez — tek müşteri seçin.')
  }
  const pbler = [...new Set(hareketler.map(h => h.paraBirimi || 'TL'))]
  if (pbler.length > 1) throw new Error(`Para birimleri karışık (${pbler.join(', ')}) — aynı para biriminden kayıtlar seçin.`)
  const uygunOlmayan = hareketler.filter(h => !BEKLEYEN_DURUMLAR.includes(h.faturaDurumu))
  if (uygunOlmayan.length) throw new Error(`${uygunOlmayan.length} kayıt fatura bekleyen durumda değil (kesilen/garanti/demo seçilemez).`)
  const fiyatsiz = hareketler.filter(h => !(Number(h.birimFiyat) > 0))
  if (fiyatsiz.length) {
    throw new Error(`Satış fiyatı boş: ${fiyatsiz.map(h => h.urunAd).slice(0, 3).join(', ')}${fiyatsiz.length > 3 ? '…' : ''} — faturalanacak üründe fiyat zorunlu.`)
  }

  const musteri = await musteriGetir(musteriIdler[0]).catch(() => null)

  const kalemler = hareketler.map(h => {
    const miktar = Math.max(0, Number(h.miktar) - Number(h.faturalananMiktar || 0))
    const birimFiyat = Number(h.birimFiyat)
    const kdv = h.kdvOrani != null ? Number(h.kdvOrani) : 20
    const ara = r2(miktar * birimFiyat)
    const kdvTutar = r2(ara * kdv / 100)
    return {
      stokKodu: h.stokKodu || '',
      urunAdi: h.urunAd + (h.seriNo ? ` (SN: ${h.seriNo})` : ''),
      aciklama: [KAYNAK_META[h.kaynak]?.isim, h.kaynakNo].filter(Boolean).join(' '),
      miktar, birim: h.birim || 'Adet', birimFiyat,
      iskontoOran: 0, kdvOran: kdv,
      araToplam: ara, kdvTutar, satirToplam: r2(ara + kdvTutar),
    }
  })
  const araToplam = r2(kalemler.reduce((a, k) => a + k.araToplam, 0))
  const kdvToplam = r2(kalemler.reduce((a, k) => a + k.kdvTutar, 0))

  const kaynakNolar = [...new Set(hareketler.map(h => h.kaynakNo).filter(Boolean))]
  const kayit = await faturaTalebiEkle({
    // siparisId BİLEREK boş: DB trigger'ı sipariş bağlı proformada o siparişin
    // TÜM bekleyen kalemlerini işaretler — burada yalnız SEÇİLENLER işaretlenmeli.
    siparisId: null, teklifId: null,
    teklifNo: kaynakNolar.slice(0, 3).join(', '),
    musteriId: Number(musteriIdler[0]),
    firmaAdi: hareketler[0].musteriAd || musteri?.firma || '',
    yetkiliAdi: [musteri?.ad, musteri?.soyad].filter(Boolean).join(' '),
    vergiNo: musteri?.vergiNo || '',
    vergiDairesi: musteri?.vergiDairesi || '',
    adres: [musteri?.adres, musteri?.sehir].filter(Boolean).join(' · '),
    telefon: musteri?.telefon || '',
    email: musteri?.email || '',
    konu: `Kullanılan malzemeler (${hareketler.length} kalem)${kaynakNolar.length ? ' — ' + kaynakNolar.slice(0, 3).join(', ') : ''}`,
    paraBirimi: pbler[0],
    dovizKuru: null,
    kalemler, araToplam, kdvToplam,
    genelToplam: r2(araToplam + kdvToplam),
    odemeSekli: '',
    durum: 'bekliyor',
    talepNotu: '',
    talepEdenId: kullanici?.id ? Number(kullanici.id) : null,
    talepEdenAd: kullanici?.ad || '',
  })

  // Seçili hareketleri proformaya bağla
  for (const h of hareketler) {
    await hareketGuncelle(
      h,
      { faturaDurumu: 'proforma_hazirlandi', proformaTalepId: kayit.id, proformaNo: kayit.talepNo },
      `Proforma ${kayit.talepNo} oluşturuldu (Faturaya Gönder)`,
      kullanici,
    )
  }

  const vergiEksik = !(musteri?.vergiNo) || !(musteri?.vergiDairesi)
  return { kayit, vergiEksik }
}

// Kaç gündür fatura bekliyor? (teslim tarihi yoksa oluşturmadan itibaren)
export const bekleyenGun = (h) => {
  if (!BEKLEYEN_DURUMLAR.includes(h.faturaDurumu)) return 0
  const baslangic = h.teslimTarihi || h.olusturmaTarih
  if (!baslangic) return 0
  return Math.max(0, Math.floor((Date.now() - new Date(baslangic).getTime()) / 86400000))
}

// Bekleyen tutar (faturalanmamış kısım) — para birimi bazında
export const bekleyenTutar = (h) => {
  if (!BEKLEYEN_DURUMLAR.includes(h.faturaDurumu)) return 0
  const kalan = Math.max(0, Number(h.miktar || 0) - Number(h.faturalananMiktar || 0))
  return kalan * Number(h.birimFiyat || 0)
}
