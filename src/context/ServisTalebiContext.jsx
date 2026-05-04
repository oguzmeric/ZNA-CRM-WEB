import { createContext, useContext, useState, useEffect } from 'react'
import {
  servisTalepleriniGetir,
  servisTalepEkle,
  servisTalepGuncelle,
  servisTalepSil,
  servisTalepGetir,
} from '../services/servisService'
import { supabase } from '../lib/supabase'
import { gorevGuncelle } from '../services/gorevService'
import { toCamel } from '../lib/mapper'

const ServisTalebiContext = createContext(null)

export const ANA_TURLER = [
  { id: 'ariza', isim: 'Arıza', ikon: '🔧', renk: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  { id: 'talep', isim: 'Talep', ikon: '📋', renk: '#0176D3', bg: 'rgba(1,118,211,0.1)' },
  { id: 'kesif', isim: 'Keşif', ikon: '🔍', renk: '#014486', bg: 'rgba(1,68,134,0.1)' },
  { id: 'bakim', isim: 'Bakım', ikon: '🛠️', renk: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  { id: 'teklif', isim: 'Teklif', ikon: '💼', renk: '#10b981', bg: 'rgba(16,185,129,0.1)' },
  { id: 'egitim', isim: 'Eğitim', ikon: '🎓', renk: '#06b6d4', bg: 'rgba(6,182,212,0.1)' },
]

export const ALT_KATEGORILER = {
  ariza: [
    { id: 'kamera_gorunum_yok', isim: 'Kamera görüntü yok' },
    { id: 'kamera_kayit_yok', isim: 'Kamera kayıt yok' },
    { id: 'nvr_arizasi', isim: 'NVR / Kayıt cihazı arızası' },
    { id: 'disk_arizasi', isim: 'Disk arızası' },
    { id: 'pdks_calismiyor', isim: 'PDKS çalışmıyor' },
    { id: 'kart_okuyucu', isim: 'Kart okuyucu çalışmıyor' },
    { id: 'turnike_arizasi', isim: 'Turnike arızası' },
    { id: 'yangin_alarm', isim: 'Yangın alarm arızası' },
    { id: 'ag_baglanti', isim: 'Ağ / Bağlantı sorunu' },
    { id: 'diger_ariza', isim: 'Diğer arıza' },
  ],
  talep: [
    { id: 'yeni_kullanici', isim: 'Yeni kullanıcı açılması' },
    { id: 'yetki_degisikligi', isim: 'Yetki değişikliği' },
    { id: 'sifre_sifirlama', isim: 'Şifre sıfırlama' },
    { id: 'cihaz_tasima', isim: 'Cihaz taşıma' },
    { id: 'sistem_revizyonu', isim: 'Sistem revizyonu' },
    { id: 'rapor_talebi', isim: 'Rapor talebi' },
    { id: 'yedek_parca', isim: 'Yedek parça talebi' },
    { id: 'entegrasyon', isim: 'Entegrasyon talebi' },
    { id: 'diger_talep', isim: 'Diğer talep' },
  ],
  kesif: [
    { id: 'yeni_proje', isim: 'Yeni proje keşfi' },
    { id: 'ilave_kamera', isim: 'İlave kamera keşfi' },
    { id: 'pdks_kesif', isim: 'PDKS keşfi' },
    { id: 'yangin_kesif', isim: 'Yangın alarm keşfi' },
    { id: 'network_kesif', isim: 'Network altyapı keşfi' },
    { id: 'diger_kesif', isim: 'Diğer keşif' },
  ],
  bakim: [
    { id: 'periyodik_bakim', isim: 'Periyodik bakım' },
    { id: 'kamera_bakimi', isim: 'Kamera bakımı' },
    { id: 'yangin_sistemi_bakimi', isim: 'Yangın sistemi bakımı' },
    { id: 'pdks_bakimi', isim: 'PDKS bakımı' },
    { id: 'network_bakimi', isim: 'Network bakımı' },
    { id: 'diger_bakim', isim: 'Diğer bakım' },
  ],
  teklif: [
    { id: 'guvenlik_sistemi', isim: 'Güvenlik sistemi teklifi' },
    { id: 'pdks_teklif', isim: 'PDKS teklifi' },
    { id: 'yangin_teklif', isim: 'Yangın sistemi teklifi' },
    { id: 'network_teklif', isim: 'Network altyapı teklifi' },
    { id: 'bakim_sozlesmesi', isim: 'Bakım sözleşmesi teklifi' },
    { id: 'diger_teklif', isim: 'Diğer teklif' },
  ],
  egitim: [
    { id: 'kullanici_egitimi', isim: 'Kullanıcı eğitimi' },
    { id: 'sistem_egitimi', isim: 'Sistem eğitimi' },
    { id: 'yazilim_egitimi', isim: 'Yazılım eğitimi' },
    { id: 'diger_egitim', isim: 'Diğer eğitim' },
  ],
}

export const ACILIYET_SEVIYELERI = [
  { id: 'dusuk', isim: 'Düşük', renk: '#6b7280', bg: 'rgba(107,114,128,0.1)', ikon: '🟢' },
  { id: 'normal', isim: 'Normal', renk: '#3b82f6', bg: 'rgba(59,130,246,0.1)', ikon: '🔵' },
  { id: 'yuksek', isim: 'Yüksek', renk: '#f59e0b', bg: 'rgba(245,158,11,0.1)', ikon: '🟡' },
  { id: 'acil', isim: 'Acil', renk: '#ef4444', bg: 'rgba(239,68,68,0.1)', ikon: '🔴' },
]

export const DURUM_LISTESI = [
  { id: 'bekliyor', isim: 'Bekliyor', renk: '#6b7280', bg: 'rgba(107,114,128,0.1)', ikon: '⏳' },
  { id: 'inceleniyor', isim: 'İnceleniyor', renk: '#0176D3', bg: 'rgba(1,118,211,0.1)', ikon: '🔍' },
  { id: 'atandi', isim: 'Atandı', renk: '#014486', bg: 'rgba(1,68,134,0.1)', ikon: '👤' },
  { id: 'devam_ediyor', isim: 'Devam Ediyor', renk: '#f59e0b', bg: 'rgba(245,158,11,0.1)', ikon: '🔄' },
  { id: 'tamamlandi', isim: 'Tamamlandı', renk: '#10b981', bg: 'rgba(16,185,129,0.1)', ikon: '✅' },
  { id: 'iptal', isim: 'İptal', renk: '#ef4444', bg: 'rgba(239,68,68,0.1)', ikon: '❌' },
]

function talepNoUret(talepler) {
  const yil = new Date().getFullYear()
  const sayi = (talepler.length + 1).toString().padStart(4, '0')
  return `TLP-${yil}-${sayi}`
}

export function ServisTalebiProvider({ children }) {
  const [talepler, setTalepler] = useState([])

  useEffect(() => {
    servisTalepleriniGetir().then(setTalepler)
  }, [])

  const talepOlustur = async (formData, kullanici) => {
    if (!kullanici?.musteriId) {
      throw new Error('Müşteri kaydı bulunamadı. Lütfen admin ile iletişime geçin.')
    }
    const yeniTalep = {
      talepNo: talepNoUret(talepler),
      musteriId: kullanici.musteriId,
      musteriAd: kullanici.ad,
      firmaAdi: kullanici.firmaAdi || '',
      anaTur: formData.anaTur,
      altKategori: formData.altKategori,
      konu: formData.konu,
      lokasyon: formData.lokasyon || '',
      cihazTuru: formData.cihazTuru || '',
      aciklama: formData.aciklama,
      aciliyet: formData.aciliyet || 'normal',
      ilgiliKisi: formData.ilgiliKisi || kullanici.ad,
      telefon: formData.telefon || '',
      uygunZaman: formData.uygunZaman || '',
      durum: 'bekliyor',
      atananKullaniciId: null,
      atananKullaniciAd: null,
      planliTarih: null,
      notlar: [],
      durumGecmisi: [
        {
          durum: 'bekliyor',
          tarih: new Date().toISOString(),
          kullaniciAd: kullanici.ad,
          aciklama: 'Talep oluşturuldu',
        },
      ],
      musteriOnay: null,
    }
    const kayitli = await servisTalepEkle(yeniTalep)
    if (kayitli) setTalepler(prev => [kayitli, ...prev])
    return kayitli
  }

  // Personel tarafı: bir müşteri için talep oluşturur
  // musteri = musteriler tablosundan seçilen kayıt
  // atanan = (opsiyonel) atanacak teknisyen (kullanicilar tablosundan)
  const talepOlusturPersonel = async (formData, kullanici, musteri, atanan) => {
    const baslangicDurum = atanan ? 'atandi' : 'bekliyor'
    const yeniTalep = {
      talepNo: talepNoUret(talepler),
      musteriId: musteri?.id || null,
      musteriAd: musteri ? `${musteri.ad || ''} ${musteri.soyad || ''}`.trim() : (formData.musteriAd || ''),
      firmaAdi: musteri?.firma || formData.firmaAdi || '',
      anaTur: formData.anaTur,
      altKategori: formData.altKategori,
      konu: formData.konu,
      lokasyon: formData.lokasyon || '',
      cihazTuru: formData.cihazTuru || '',
      aciklama: formData.aciklama,
      aciliyet: formData.aciliyet || 'normal',
      ilgiliKisi: formData.ilgiliKisi || (musteri ? `${musteri.ad} ${musteri.soyad}` : kullanici.ad),
      telefon: formData.telefon || musteri?.telefon || '',
      uygunZaman: formData.uygunZaman || '',
      durum: baslangicDurum,
      atananKullaniciId: atanan?.id || null,
      atananKullaniciAd: atanan?.ad || null,
      planliTarih: formData.planliTarih || null,
      notlar: [],
      durumGecmisi: [
        {
          durum: 'bekliyor',
          tarih: new Date().toISOString(),
          kullaniciAd: kullanici.ad,
          aciklama: `Personel tarafından oluşturuldu${musteri ? ` — ${musteri.firma || musteri.ad}` : ''}`,
        },
        ...(atanan ? [{
          durum: 'atandi',
          tarih: new Date().toISOString(),
          kullaniciAd: kullanici.ad,
          aciklama: `${atanan.ad} atandı`,
        }] : []),
      ],
      musteriOnay: null,
    }
    const kayitli = await servisTalepEkle(yeniTalep)
    if (kayitli) setTalepler(prev => [kayitli, ...prev])
    return kayitli
  }

  // Görevden servis talebi oluştur — iki yönlü FK ile bağlar
  // gorev: { id, baslik, aciklama, musteriId, firmaAdi, lokasyonId?, atananId?, gorusmeId?, bitisTarihi? }
  const talepOlusturGorevden = async (gorev, kullanici, atananKullanici) => {
    // Lokasyon adını çek (varsa)
    let lokasyonMetni = ''
    if (gorev.lokasyonId) {
      const { data: lok } = await supabase
        .from('musteri_lokasyonlari')
        .select('ad')
        .eq('id', gorev.lokasyonId)
        .maybeSingle()
      lokasyonMetni = lok?.ad || ''
    }
    // Müşteri kaydını çek (talepOlusturPersonel için)
    let musteri = null
    if (gorev.musteriId) {
      const { data } = await supabase
        .from('musteriler').select('*').eq('id', gorev.musteriId).maybeSingle()
      musteri = data ? toCamel(data) : null
    }

    const formData = {
      anaTur: 'ariza',
      altKategori: '',
      konu: gorev.baslik,
      aciklama: gorev.aciklama || '',
      aciliyet: 'normal',
      lokasyon: lokasyonMetni,
      cihazTuru: '',
      ilgiliKisi: '',
      telefon: '',
      uygunZaman: '',
      planliTarih: gorev.bitisTarihi || null,
    }
    const yeni = await talepOlusturPersonel(formData, kullanici, musteri, atananKullanici)
    if (!yeni) return null

    // İki yönlü FK kur
    try {
      await Promise.all([
        servisTalepGuncelle(yeni.id, { gorevId: gorev.id, gorusmeId: gorev.gorusmeId || null }, kullanici.ad, 'Görevden bağlandı'),
        gorevGuncelle(gorev.id, { servisTalepId: yeni.id }),
      ])
      // State güncellemesi (servis talebi tarafı)
      setTalepler(prev => prev.map(t => t.id === yeni.id ? { ...t, gorevId: gorev.id, gorusmeId: gorev.gorusmeId || null } : t))
      return { ...yeni, gorevId: gorev.id, gorusmeId: gorev.gorusmeId || null }
    } catch (err) {
      console.error('[talepOlusturGorevden] FK güncellemesi hata:', err)
      return yeni
    }
  }

  const talepGuncelle = async (id, guncellenmis, kullaniciAd, aciklama = '') => {
    const mevcutTalep = talepler.find(t => t.id === id)
    if (!mevcutTalep) return

    const durumDegisti = guncellenmis.durum && guncellenmis.durum !== mevcutTalep.durum
    const yeniGecmis = durumDegisti
      ? [
          ...(mevcutTalep.durumGecmisi || []),
          {
            durum: guncellenmis.durum,
            tarih: new Date().toISOString(),
            kullaniciAd: kullaniciAd || 'Sistem',
            aciklama,
          },
        ]
      : mevcutTalep.durumGecmisi

    const guncellenenData = {
      ...guncellenmis,
      durumGecmisi: yeniGecmis,
    }

    const kayitli = await servisTalepGuncelle(id, guncellenenData)
    if (kayitli) {
      setTalepler(prev => prev.map(t => t.id === id ? { ...t, ...kayitli } : t))
    }
  }

  const notEkle = async (talepId, metin, kullanici, tip = 'ic') => {
    const mevcutTalep = talepler.find(t => t.id === talepId)
    if (!mevcutTalep) return

    const yeniNot = {
      id: crypto.randomUUID(),
      kullaniciId: kullanici.id,
      kullaniciAd: kullanici.ad,
      metin,
      tarih: new Date().toISOString(),
      tip,
    }
    const yeniNotlar = [...(mevcutTalep.notlar || []), yeniNot]
    const kayitli = await servisTalepGuncelle(talepId, { notlar: yeniNotlar })
    if (kayitli) {
      setTalepler(prev => prev.map(t => t.id === talepId ? { ...t, ...kayitli } : t))
    }
  }

  const talepSil = async (id) => {
    // Bucket'taki dosyaları temizle (orphan kalmasın)
    const talep = talepler.find(t => t.id === id)
    const dosyaPaths = (talep?.dosyalar || []).map(d => d.path).filter(Boolean)
    if (dosyaPaths.length > 0) {
      await supabase.storage.from('servis-talep-dosyalari').remove(dosyaPaths)
    }
    await servisTalepSil(id)
    setTalepler(prev => prev.filter(t => t.id !== id))
  }

  // ─── Dosya yönetimi ────────────────────────────────────────────
  const dosyaYukle = async (talepId, file, uploaderAd = '') => {
    const safeName = file.name.replace(/[^\w.\-]/g, '_')
    const path = `${talepId}/${Date.now()}_${safeName}`
    const { error } = await supabase.storage
      .from('servis-talep-dosyalari')
      .upload(path, file, { contentType: file.type })
    if (error) throw error

    const meta = {
      path,
      name: file.name,
      type: file.type,
      size: file.size,
      uploadedAt: new Date().toISOString(),
      uploaderAd: uploaderAd || null,
    }
    const mevcut = talepler.find(t => t.id === talepId)
    const yeniDosyalar = [...(mevcut?.dosyalar || []), meta]
    const kayitli = await servisTalepGuncelle(talepId, { dosyalar: yeniDosyalar })
    if (kayitli) setTalepler(prev => prev.map(t => t.id === talepId ? { ...t, ...kayitli } : t))
    return meta
  }

  const dosyaLinkiAl = async (path) => {
    const { data, error } = await supabase.storage
      .from('servis-talep-dosyalari')
      .createSignedUrl(path, 60)
    if (error) throw error
    return data.signedUrl
  }

  const dosyaSil = async (talepId, path) => {
    const { error } = await supabase.storage
      .from('servis-talep-dosyalari')
      .remove([path])
    if (error) throw error
    const mevcut = talepler.find(t => t.id === talepId)
    const kalanlar = (mevcut?.dosyalar || []).filter(d => d.path !== path)
    const kayitli = await servisTalepGuncelle(talepId, { dosyalar: kalanlar })
    if (kayitli) setTalepler(prev => prev.map(t => t.id === talepId ? { ...t, ...kayitli } : t))
  }

  const musteriTalepleri = (musteriId) =>
    talepler.filter((t) => t.musteriId === musteriId)

  const bekleyenSayisi = talepler.filter(
    (t) => t.durum === 'bekliyor' || t.durum === 'inceleniyor'
  ).length

  return (
    <ServisTalebiContext.Provider
      value={{
        talepler,
        talepOlustur,
        talepOlusturPersonel,
        talepOlusturGorevden,
        talepGuncelle,
        talepSil,
        notEkle,
        dosyaYukle,
        dosyaLinkiAl,
        dosyaSil,
        musteriTalepleri,
        bekleyenSayisi,
        ANA_TURLER,
        ALT_KATEGORILER,
        ACILIYET_SEVIYELERI,
        DURUM_LISTESI,
      }}
    >
      {children}
    </ServisTalebiContext.Provider>
  )
}

export function useServisTalebi() {
  return useContext(ServisTalebiContext)
}
