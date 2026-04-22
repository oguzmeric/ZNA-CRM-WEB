import { createContext, useContext, useState, useEffect } from 'react'
import {
  kargolariGetir,
  kargoEkle,
  kargoGuncelle as kargoGuncelleDB,
  kargoSil as kargoSilDB,
} from '../services/kargoService'

const KargoContext = createContext(null)

export const KARGO_FIRMALARI = [
  { id: 'mng',     isim: 'MNG Kargo',     renk: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  { id: 'yurtici', isim: 'Yurtiçi Kargo', renk: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  { id: 'ptt',     isim: 'PTT Kargo',     renk: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
  { id: 'aras',    isim: 'Aras Kargo',    renk: '#014486', bg: 'rgba(1,68,134,0.1)' },
  { id: 'surat',   isim: 'Sürat Kargo',   renk: '#0176D3', bg: 'rgba(1,118,211,0.1)' },
  { id: 'dhl',     isim: 'DHL',           renk: '#d97706', bg: 'rgba(217,119,6,0.1)' },
  { id: 'ups',     isim: 'UPS',           renk: '#92400e', bg: 'rgba(146,64,14,0.1)' },
  { id: 'fedex',   isim: 'FedEx',         renk: '#7c3aed', bg: 'rgba(124,58,237,0.1)' },
  { id: 'diger',   isim: 'Diğer',         renk: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
]

export const DURUM_LISTESI = [
  { id: 'hazirlaniyor',   isim: 'Hazırlanıyor',   renk: '#6b7280', bg: 'rgba(107,114,128,0.1)', ikon: '📦', sira: 1 },
  { id: 'kargoya_verildi',isim: 'Kargoya Verildi',renk: '#3b82f6', bg: 'rgba(59,130,246,0.1)',  ikon: '🚚', sira: 2 },
  { id: 'transfer',       isim: 'Transfer',        renk: '#014486', bg: 'rgba(1,68,134,0.1)', ikon: '🔄', sira: 3 },
  { id: 'dagitimda',      isim: 'Dağıtımda',       renk: '#f59e0b', bg: 'rgba(245,158,11,0.1)', ikon: '🛵', sira: 4 },
  { id: 'teslim_edildi',  isim: 'Teslim Edildi',   renk: '#10b981', bg: 'rgba(16,185,129,0.1)', ikon: '✅', sira: 5 },
  { id: 'iade',           isim: 'İade',             renk: '#ef4444', bg: 'rgba(239,68,68,0.1)', ikon: '↩️', sira: 0 },
]

export const ODEME_YONTEMLERI = [
  { id: 'gonderici', isim: 'Gönderici Öder' },
  { id: 'alici',     isim: 'Alıcı Öder' },
  { id: 'kapida',    isim: 'Kapıda Ödeme' },
]

function kargoNoUret(kargolar) {
  const yil = new Date().getFullYear()
  const sayi = (kargolar.length + 1).toString().padStart(4, '0')
  return `KRG-${yil}-${sayi}`
}

export function KargoProvider({ children }) {
  const [kargolar, setKargolar] = useState([])

  useEffect(() => {
    kargolariGetir().then(setKargolar)
  }, [])

  const kargoOlustur = async (formData, kullanici) => {
    const yeni = {
      kargoNo: kargoNoUret(kargolar),
      tip: formData.tip || 'giden',
      durum: 'hazirlaniyor',
      kargoFirmasi: formData.kargoFirmasi,
      takipNo: formData.takipNo || '',
      gonderen: {
        ad: formData.gonderenAd || '',
        firma: formData.gonderenFirma || '',
        adres: formData.gonderenAdres || '',
        telefon: formData.gonderenTelefon || '',
      },
      alici: {
        ad: formData.aliciAd || '',
        firma: formData.aliciFirma || '',
        adres: formData.aliciAdres || '',
        telefon: formData.aliciTelefon || '',
      },
      icerik: formData.icerik || '',
      agirlik: formData.agirlik || '',
      desi: formData.desi || '',
      ucret: formData.ucret || '',
      odemeYontemi: formData.odemeYontemi || 'gonderici',
      tahminiTeslim: formData.tahminiTeslim || '',
      teslimTarihi: null,
      ilgiliModul: formData.ilgiliModul || null,
      ilgiliKullaniciIds: formData.ilgiliKullaniciIds || [],
      notlar: [],
      durumGecmisi: [
        {
          durum: 'hazirlaniyor',
          tarih: new Date().toISOString(),
          kullaniciAd: kullanici.ad,
          aciklama: 'Kargo kaydı oluşturuldu',
        },
      ],
      olusturanId: kullanici.id,
      olusturanAd: kullanici.ad,
    }
    const kayitli = await kargoEkle(yeni)
    if (kayitli) setKargolar(prev => [kayitli, ...prev])
    return kayitli
  }

  const kargoDurumGuncelle = async (id, yeniDurum, kullaniciAd, aciklama = '') => {
    const mevcutKargo = kargolar.find(k => k.id === id)
    if (!mevcutKargo) return

    const teslimTarihi = yeniDurum === 'teslim_edildi' ? new Date().toISOString() : mevcutKargo.teslimTarihi
    const yeniGecmis = [
      ...(mevcutKargo.durumGecmisi || []),
      {
        durum: yeniDurum,
        tarih: new Date().toISOString(),
        kullaniciAd,
        aciklama,
      },
    ]

    const kayitli = await kargoGuncelleDB(id, {
      durum: yeniDurum,
      teslimTarihi,
      durumGecmisi: yeniGecmis,
    })
    if (kayitli) {
      setKargolar(prev => prev.map(k => k.id === id ? { ...k, ...kayitli } : k))
    }
  }

  const kargoGuncelle = async (id, guncellenmis) => {
    const kayitli = await kargoGuncelleDB(id, guncellenmis)
    if (kayitli) {
      setKargolar(prev => prev.map(k => k.id === id ? { ...k, ...kayitli } : k))
    }
  }

  const kargoNotEkle = async (id, metin, kullanici) => {
    const mevcutKargo = kargolar.find(k => k.id === id)
    if (!mevcutKargo) return

    const yeniNot = {
      id: crypto.randomUUID(),
      kullaniciId: kullanici.id,
      kullaniciAd: kullanici.ad,
      metin,
      tarih: new Date().toISOString(),
    }
    const yeniNotlar = [...(mevcutKargo.notlar || []), yeniNot]
    const kayitli = await kargoGuncelleDB(id, { notlar: yeniNotlar })
    if (kayitli) {
      setKargolar(prev => prev.map(k => k.id === id ? { ...k, ...kayitli } : k))
    }
  }

  const kargoSil = async (id) => {
    await kargoSilDB(id)
    setKargolar(prev => prev.filter(k => k.id !== id))
  }

  const aktifKargoSayisi = kargolar.filter(
    (k) => k.durum !== 'teslim_edildi' && k.durum !== 'iade'
  ).length

  return (
    <KargoContext.Provider
      value={{
        kargolar,
        kargoOlustur,
        kargoDurumGuncelle,
        kargoGuncelle,
        kargoNotEkle,
        kargoSil,
        aktifKargoSayisi,
        KARGO_FIRMALARI,
        DURUM_LISTESI,
        ODEME_YONTEMLERI,
      }}
    >
      {children}
    </KargoContext.Provider>
  )
}

export function useKargo() {
  return useContext(KargoContext)
}
