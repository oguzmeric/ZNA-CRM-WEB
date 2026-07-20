// Keşif Modülü servisi (mig 139) — saha keşif kayıtları.
// kesif_no (KSF-YYYY-NNNN) DB trigger üretir, client göndermez.

import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'

const FOTO_BUCKET = 'kesif-foto'
export const KESIF_FOTO_MAX_MB = 8
export const KESIF_FOTO_MAX = KESIF_FOTO_MAX_MB * 1024 * 1024

export const KESIF_KATEGORILERI = [
  { id: 'kamera',       ad: 'Kamera',        ikon: '📷' },
  { id: 'kayit_cihazi', ad: 'Kayıt Cihazı',  ikon: '💾' },
  { id: 'kablo',        ad: 'Kablo',         ikon: '🔌' },
  { id: 'network',      ad: 'Network',       ikon: '🌐' },
  { id: 'malzeme',      ad: 'Malzeme',       ikon: '🧰' },
  { id: 'iscilik',      ad: 'İşçilik',       ikon: '👷' },
  { id: 'diger',        ad: 'Diğer',         ikon: '📦' },
]

export const KESIF_DURUMLARI = [
  { id: 'acik',       ad: 'Açık',        tone: 'lead' },
  { id: 'tamamlandi', ad: 'Tamamlandı',  tone: 'aktif' },
  { id: 'iptal',      ad: 'İptal',       tone: 'kayip' },
]

export const KESIF_ONCELIKLERI = [
  { id: 'dusuk',  ad: 'Düşük',  renk: '#94A3B8' },
  { id: 'normal', ad: 'Normal', renk: '#3B82F6' },
  { id: 'yuksek', ad: 'Yüksek', renk: '#F59E0B' },
  { id: 'acil',   ad: 'Acil',   renk: '#DC2626' },
]

// Keşif türleri (spec §4) — çoklu seçim; seçilen türe göre teknik not alanı açılır
export const KESIF_TURLERI = [
  { id: 'cctv',              ad: 'CCTV Kamera Sistemi' },
  { id: 'video_analitik',    ad: 'Video Analitik Sistemi' },
  { id: 'alev_duman',        ad: 'Alev ve Duman Algılama' },
  { id: 'plaka_tanima',      ad: 'Plaka Tanıma Sistemi' },
  { id: 'kartli_gecis',      ad: 'Kartlı Geçiş Sistemi' },
  { id: 'pdks',              ad: 'PDKS Sistemi' },
  { id: 'turnike',           ad: 'Turnike Sistemi' },
  { id: 'bariyer',           ad: 'Bariyer Sistemi' },
  { id: 'network',           ad: 'Network Altyapısı' },
  { id: 'kablosuz_ag',       ad: 'Kablosuz Ağ Sistemi' },
  { id: 'fiber_optik',       ad: 'Fiber Optik Altyapı' },
  { id: 'yapisal_kablolama', ad: 'Yapısal Kablolama' },
  { id: 'telefon_santrali',  ad: 'Telefon Santrali' },
  { id: 'interkom',          ad: 'İnterkom Sistemi' },
  { id: 'hirsiz_alarm',      ad: 'Hırsız Alarm Sistemi' },
  { id: 'yangin_algilama',   ad: 'Yangın Algılama Sistemi' },
  { id: 'seslendirme',       ad: 'Seslendirme ve Anons' },
  { id: 'sistem_odasi',      ad: 'Sistem Odası' },
  { id: 'veri_merkezi',      ad: 'Veri Merkezi' },
  { id: 'zayif_akim',        ad: 'Zayıf Akım Altyapısı' },
  { id: 'bakim_yenileme',    ad: 'Bakım ve Sistem Yenileme' },
  { id: 'diger',             ad: 'Diğer' },
]

// ---------- Keşifler ----------
export const kesifleriGetir = async () => {
  const { data, error } = await supabase
    .from('kesifler')
    .select('*')
    .order('olusturma_tarih', { ascending: false })
  if (error) { console.error('kesifleriGetir:', error.message); return [] }
  return arrayToCamel(data)
}

export const kesifGetir = async (id) => {
  const { data, error } = await supabase.from('kesifler').select('*').eq('id', id).single()
  if (error) { console.error('kesifGetir:', error.message); return null }
  return toCamel(data)
}

export const kesifEkle = async (kesif) => {
  const { id, kesifNo, olusturmaTarih, guncellemeTarih, ...rest } = kesif
  const { data, error } = await supabase.from('kesifler').insert(toSnake(rest)).select().single()
  if (error) throw error
  return toCamel(data)
}

export const kesifGuncelle = async (id, alanlar) => {
  const { id: _id, kesifNo, olusturmaTarih, guncellemeTarih, ...rest } = alanlar
  const { data, error } = await supabase.from('kesifler').update(toSnake(rest)).eq('id', id).select().single()
  if (error) throw error
  return toCamel(data)
}

export const kesifSil = async (id) => {
  // Fotolar storage'dan da temizlensin (DB satırları cascade siliniyor)
  const { data: fotolar } = await supabase.from('kesif_fotolari').select('dosya_yolu, cizim_yolu').eq('kesif_id', id)
  const { error } = await supabase.from('kesifler').delete().eq('id', id)
  if (error) throw error
  const yollar = (fotolar || []).flatMap(f => [f.dosya_yolu, f.cizim_yolu]).filter(Boolean)
  if (yollar.length) await supabase.storage.from(FOTO_BUCKET).remove(yollar).catch(() => {})
}

// ---------- Kalemler ----------
export const kesifKalemleriGetir = async (kesifId) => {
  const { data, error } = await supabase
    .from('kesif_kalemleri')
    .select('*')
    .eq('kesif_id', kesifId)
    .order('siralama', { ascending: true })
    .order('id', { ascending: true })
  if (error) { console.error('kesifKalemleriGetir:', error.message); return [] }
  return arrayToCamel(data)
}

export const kesifKalemEkle = async (kalem) => {
  const { id, olusturmaTarih, ...rest } = kalem
  const { data, error } = await supabase.from('kesif_kalemleri').insert(toSnake(rest)).select().single()
  if (error) throw error
  return toCamel(data)
}

export const kesifKalemGuncelle = async (id, alanlar) => {
  const { id: _id, olusturmaTarih, ...rest } = alanlar
  const { data, error } = await supabase.from('kesif_kalemleri').update(toSnake(rest)).eq('id', id).select().single()
  if (error) throw error
  return toCamel(data)
}

export const kesifKalemSil = async (id) => {
  const { error } = await supabase.from('kesif_kalemleri').delete().eq('id', id)
  if (error) throw error
}

// ---------- Fotoğraflar ----------
// Fotoğraf etiketi (KEŞİF DÜZENLEME dokümanı §2) — mig 200 CHECK ile birebir
export const KESIF_FOTO_ETIKETLERI = [
  { id: 'mevcut_durum',     ad: 'Mevcut Durum',     renk: '#64748b' },
  { id: 'ariza_noktasi',    ad: 'Arıza Noktası',    renk: '#dc2626' },
  { id: 'montaj_noktasi',   ad: 'Montaj Noktası',   renk: '#16a34a' },
  { id: 'kablo_guzergahi',  ad: 'Kablo Güzergahı',  renk: '#f59e0b' },
  { id: 'elektrik_noktasi', ad: 'Elektrik Noktası', renk: '#ea580c' },
  { id: 'network_noktasi',  ad: 'Network Noktası',  renk: '#2563eb' },
  { id: 'riskli_alan',      ad: 'Riskli Alan',      renk: '#9333ea' },
]
export const kesifFotoEtiketBilgi = (id) => KESIF_FOTO_ETIKETLERI.find(e => e.id === id) || null

export const kesifFotolariGetir = async (kesifId) => {
  const { data, error } = await supabase
    .from('kesif_fotolari')
    .select('*')
    .eq('kesif_id', kesifId)
    .order('olusturma_tarih', { ascending: false })
  if (error) { console.error('kesifFotolariGetir:', error.message); return [] }
  return arrayToCamel(data)
}

export const kesifFotoYukle = async (kesifId, file, meta = {}) => {
  if (file.size > KESIF_FOTO_MAX) throw new Error(`Fotoğraf çok büyük (max ${KESIF_FOTO_MAX_MB} MB).`)
  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase().slice(0, 6)
  const yol = `${kesifId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error: upErr } = await supabase.storage.from(FOTO_BUCKET).upload(yol, file, {
    contentType: file.type || 'image/jpeg',
    cacheControl: '3600',
  })
  if (upErr) throw upErr
  const { data, error } = await supabase.from('kesif_fotolari').insert({
    kesif_id: kesifId,
    dosya_yolu: yol,
    baslik: meta.baslik?.trim() || null,
    aciklama: meta.aciklama?.trim() || null,
    montaj_notu: meta.montajNotu?.trim() || null,
    mahal: meta.mahal?.trim() || null,
    kat_bolum: meta.katBolum?.trim() || null,
    etiket: meta.etiket || null,
    kalem_id: meta.kalemId || null,
    olusturan_ad: meta.olusturanAd || null,
    olusturan_id: meta.olusturanId || null,
  }).select().single()
  if (error) {
    await supabase.storage.from(FOTO_BUCKET).remove([yol]).catch(() => {})
    throw error
  }
  return toCamel(data)
}

// Alt bilgi / etiket / kalem ilişkisi güncelleme
export const kesifFotoGuncelle = async (fotoId, alanlar) => {
  const izinli = ['baslik', 'aciklama', 'montajNotu', 'mahal', 'katBolum', 'etiket', 'kalemId']
  const temiz = {}
  for (const k of izinli) if (k in alanlar) temiz[k] = alanlar[k] === '' ? null : alanlar[k]
  temiz.guncellemeTarih = new Date().toISOString()
  const { data, error } = await supabase.from('kesif_fotolari')
    .update(toSnake(temiz)).eq('id', fotoId).select('id, baslik, aciklama, montaj_notu, mahal, kat_bolum, etiket, kalem_id')
  if (error) throw error
  if (!data?.length) throw new Error('Güncelleme yetkin yok — fotoğrafı yalnız ekleyen kişi veya yönetici düzenleyebilir.')
  return toCamel(data[0])
}

// Çizimli versiyonu kaydet: flatten PNG blob + vektör veri (yeniden düzenleme için).
// Orijinal dosyaya DOKUNULMAZ; çizim {kesifId}/cizim/{fotoId}.png yoluna yazılır (üzerine yazılır).
export const kesifFotoCizimKaydet = async (foto, pngBlob, cizimVeri, kullanici) => {
  const yol = foto.cizimYolu || `${foto.kesifId}/cizim/${foto.id}_${Date.now()}.png`
  const { error: upErr } = await supabase.storage.from(FOTO_BUCKET).upload(yol, pngBlob, {
    contentType: 'image/png', cacheControl: '3600', upsert: true,
  })
  if (upErr) throw upErr
  const gecmis = [...(foto.cizimGecmisi || []), {
    ad: kullanici?.ad || '—', tarih: new Date().toISOString(),
    islem: foto.cizimYolu ? 'cizim_guncellendi' : 'cizim_eklendi',
  }]
  const { data, error } = await supabase.from('kesif_fotolari').update({
    cizim_yolu: yol,
    cizim_veri: cizimVeri || null,
    cizim_gecmisi: gecmis,
    guncelleme_tarih: new Date().toISOString(),
  }).eq('id', foto.id).select('id, cizim_yolu, cizim_veri, cizim_gecmisi')
  if (error) throw error
  if (!data?.length) throw new Error('Çizim kaydetme yetkin yok.')
  return toCamel(data[0])
}

// Çizimi kaldır (orijinale dön)
export const kesifFotoCizimSil = async (foto, kullanici) => {
  const gecmis = [...(foto.cizimGecmisi || []), {
    ad: kullanici?.ad || '—', tarih: new Date().toISOString(), islem: 'cizim_silindi',
  }]
  const { data, error } = await supabase.from('kesif_fotolari').update({
    cizim_yolu: null, cizim_veri: null, cizim_gecmisi: gecmis,
    guncelleme_tarih: new Date().toISOString(),
  }).eq('id', foto.id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Çizim silme yetkin yok.')
  if (foto.cizimYolu) await supabase.storage.from(FOTO_BUCKET).remove([foto.cizimYolu]).catch(() => {})
}

export const kesifFotoSil = async (foto) => {
  const { data, error } = await supabase.from('kesif_fotolari').delete().eq('id', foto.id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Silme yetkin yok — fotoğrafı yalnız ekleyen kişi veya yönetici silebilir.')
  const yollar = [foto.dosyaYolu, foto.cizimYolu].filter(Boolean)
  if (yollar.length) await supabase.storage.from(FOTO_BUCKET).remove(yollar).catch(() => {})
}

// ---------- Krokiler (mig 202) ----------
// Sembol kategorileri — palet sekmeleri; her sembolün rengi kategorisinden gelir
export const KROKI_KATEGORILER = [
  { id: 'kamera',  ad: 'Kamera',        renk: '#2563eb' },
  { id: 'network', ad: 'Network',       renk: '#0891b2' },
  { id: 'pts',     ad: 'PTS & Saha',    renk: '#4f46e5' },
  { id: 'turnike', ad: 'Turnike',       renk: '#a16207' },
  { id: 'santral', ad: 'Santral',       renk: '#0f766e' },
  { id: 'yangin',  ad: 'Yangın',        renk: '#dc2626' },
  { id: 'ses',     ad: 'Ses',           renk: '#7c3aed' },
  { id: 'hemsire', ad: 'Hemşire Çağrı', renk: '#db2777' },
  { id: 'alarm',   ad: 'Hırsız Alarm',  renk: '#ea580c' },
  { id: 'genel',   ad: 'Genel',         renk: '#64748b' },
]

// Sembol paleti — web + mobil AYNI liste (kod = lejant etiketi: DM1, SW2…)
// eski:true → palete çıkmaz, eski kayıtlı krokiler için tanım korunur
export const KROKI_SEMBOLLERI = [
  // Kamera sistemleri
  { id: 'dome',      kod: 'DM',  kategori: 'kamera', ad: 'Dome',       renk: '#2563eb' },
  { id: 'bullet',    kod: 'BLT', kategori: 'kamera', ad: 'Bullet',     renk: '#2563eb' },
  { id: 'ptz',       kod: 'PTZ', kategori: 'kamera', ad: 'PTZ',        renk: '#2563eb' },
  { id: 'speeddome', kod: 'SD',  kategori: 'kamera', ad: 'Speed Dome', renk: '#2563eb' },
  { id: 'nvr',       kod: 'NVR', kategori: 'kamera', ad: 'NVR',        renk: '#2563eb' },
  // Network sistemleri
  { id: 'switch',   kod: 'SW',  kategori: 'network', ad: 'Switch',   renk: '#0891b2' },
  { id: 'cat6',     kod: 'C6',  kategori: 'network', ad: 'Cat6',     renk: '#0891b2' },
  { id: 'fiber',    kod: 'FO',  kategori: 'network', ad: 'Fiber',    renk: '#0891b2' },
  { id: 'ap',       kod: 'AP',  kategori: 'network', ad: 'AP',       renk: '#0891b2' },
  { id: 'firewall', kod: 'FW',  kategori: 'network', ad: 'Firewall', renk: '#0891b2' },
  { id: 'modem',    kod: 'MDM', kategori: 'network', ad: 'Modem',    renk: '#0891b2' },
  { id: 'backbone', kod: 'BB',  kategori: 'network', ad: 'Backbone', renk: '#0891b2' },
  { id: 'kabin',    kod: 'KB',  kategori: 'network', ad: 'Kabin',    renk: '#0891b2' },
  { id: 'pano',     kod: 'PN',  kategori: 'network', ad: 'Pano',     renk: '#0891b2' },
  { id: 'ekbuat',   kod: 'EB',  kategori: 'network', ad: 'Ekbuat',   renk: '#0891b2' },
  { id: 'menhol',   kod: 'MH',  kategori: 'network', ad: 'Menhol',   renk: '#0891b2' },
  // PTS & saha ekipmanları
  { id: 'pts',   kod: 'PTS', kategori: 'pts', ad: 'PTS Kamera', renk: '#4f46e5' },
  { id: 'mobo',  kod: 'MB',  kategori: 'pts', ad: 'Mobo',       renk: '#4f46e5' },
  { id: 'kiosk', kod: 'KSK', kategori: 'pts', ad: 'Kiosk',      renk: '#4f46e5' },
  { id: 'kapan', kod: 'KPN', kategori: 'pts', ad: 'Kapan',      renk: '#4f46e5' },
  { id: 'kasis', kod: 'KSS', kategori: 'pts', ad: 'Kasis',      renk: '#4f46e5' },
  { id: 'duba',  kod: 'DB',  kategori: 'pts', ad: 'Duba',       renk: '#4f46e5' },
  { id: 'led',   kod: 'LED', kategori: 'pts', ad: 'LED',        renk: '#4f46e5' },
  { id: 'pc',    kod: 'PC',  kategori: 'pts', ad: 'PC',         renk: '#4f46e5' },
  { id: 'tv',    kod: 'TV',  kategori: 'pts', ad: 'TV',         renk: '#4f46e5' },
  // Turnike sistemleri
  { id: 'turnike',       kod: 'TRN', kategori: 'turnike', ad: 'Turnike',         renk: '#a16207' },
  { id: 'kartokuyucu',   kod: 'KO',  kategori: 'turnike', ad: 'Kart Okuyucu',    renk: '#a16207' },
  { id: 'gpanel',        kod: 'PNL', kategori: 'turnike', ad: 'Panel',           renk: '#a16207' },
  { id: 'qrokuyucu',     kod: 'QR',  kategori: 'turnike', ad: 'QR Okuyucu',      renk: '#a16207' },
  { id: 'elsensoru',     kod: 'EL',  kategori: 'turnike', ad: 'El Sensörü',      renk: '#a16207' },
  { id: 'seperator',     kod: 'SP',  kategori: 'turnike', ad: 'Seperatör',       renk: '#a16207' },
  { id: 'manyetikkilit', kod: 'MK',  kategori: 'turnike', ad: 'Manyetik Kilit',  renk: '#a16207' },
  // Santral sistemleri
  { id: 'santral',     kod: 'SNT', kategori: 'santral', ad: 'Santral',      renk: '#0f766e' },
  { id: 'telefon',     kod: 'TEL', kategori: 'santral', ad: 'Telefon',      renk: '#0f766e' },
  { id: 'mdf',         kod: 'MDF', kategori: 'santral', ad: 'MDF',          renk: '#0f766e' },
  { id: 'dectbaz',     kod: 'DCB', kategori: 'santral', ad: 'DECT Baz',     renk: '#0f766e' },
  { id: 'decttelefon', kod: 'DCT', kategori: 'santral', ad: 'DECT Telefon', renk: '#0f766e' },
  // Yangın sistemleri
  { id: 'dumandedektor',   kod: 'DD',  kategori: 'yangin', ad: 'Duman Dedektörü',  renk: '#dc2626' },
  { id: 'isidedektor',     kod: 'ISD', kategori: 'yangin', ad: 'Isı Dedektörü',    renk: '#dc2626' },
  { id: 'combinededektor', kod: 'CD',  kategori: 'yangin', ad: 'Combine Dedektör', renk: '#dc2626' },
  { id: 'gazdedektor',     kod: 'GD',  kategori: 'yangin', ad: 'Gaz Dedektörü',    renk: '#dc2626' },
  { id: 'yanginpaneli',    kod: 'YP',  kategori: 'yangin', ad: 'Yangın Paneli',    renk: '#dc2626' },
  { id: 'tekrarlayici',    kod: 'TKR', kategori: 'yangin', ad: 'Tekrarlayıcı',     renk: '#dc2626' },
  { id: 'modul',           kod: 'MDL', kategori: 'yangin', ad: 'Modül',            renk: '#dc2626' },
  { id: 'siren',           kod: 'SRN', kategori: 'yangin', ad: 'Siren',            renk: '#dc2626' },
  { id: 'buton',           kod: 'BTN', kategori: 'yangin', ad: 'Buton',            renk: '#dc2626' },
  // Ses sistemleri
  { id: 'tavanhoparlor', kod: 'TH',  kategori: 'ses', ad: 'Tavan Hoparlörü', renk: '#7c3aed' },
  { id: 'duvarhoparlor', kod: 'DH',  kategori: 'ses', ad: 'Duvar Hoparlörü', renk: '#7c3aed' },
  { id: 'anfi',          kod: 'ANF', kategori: 'ses', ad: 'Anfi',            renk: '#7c3aed' },
  { id: 'mikrofon',      kod: 'MIC', kategori: 'ses', ad: 'Mikrofon',        renk: '#7c3aed' },
  // Hemşire çağrı
  { id: 'ikazlambasi', kod: 'IL', kategori: 'hemsire', ad: 'İkaz Lambası', renk: '#db2777' },
  { id: 'cagripaneli', kod: 'CP', kategori: 'hemsire', ad: 'Çağrı Paneli', renk: '#db2777' },
  { id: 'cagributonu', kod: 'CB', kategori: 'hemsire', ad: 'Çağrı Butonu', renk: '#db2777' },
  // Hırsız alarm sistemleri
  { id: 'alarmsireni',      kod: 'AS',  kategori: 'alarm', ad: 'Alarm Sireni',      renk: '#ea580c' },
  { id: 'pir',              kod: 'PIR', kategori: 'alarm', ad: 'PIR',               renk: '#ea580c' },
  { id: 'manyetikdedektor', kod: 'MD',  kategori: 'alarm', ad: 'Manyetik Dedektör', renk: '#ea580c' },
  { id: 'alarmpaneli',      kod: 'ALP', kategori: 'alarm', ad: 'Alarm Paneli',      renk: '#ea580c' },
  // Genel
  { id: 'guc',     kod: 'G',  kategori: 'genel', ad: 'Güç Noktası', renk: '#64748b' },
  { id: 'bariyer', kod: 'B',  kategori: 'genel', ad: 'Bariyer',     renk: '#64748b' },
  { id: 'kapi',    kod: 'KP', kategori: 'genel', ad: 'Kapı',        renk: '#64748b' },
  // Eski (v1) semboller — eski krokiler bozulmasın diye tanım durur, palete çıkmaz
  { id: 'kamera',  kod: 'K',  kategori: 'kamera', ad: 'Kamera',          renk: '#2563eb', eski: true },
  { id: 'network', kod: 'NT', kategori: 'genel',  ad: 'Network Noktası', renk: '#4f46e5', eski: true },
]
export const krokiSembolBilgi = (id) => KROKI_SEMBOLLERI.find(s => s.id === id) || KROKI_SEMBOLLERI[0]

// Tuval sembol ikonları — 24×24 stroke path (canvas Path2D + Skia MakeFromSVGString ortak).
// Her ürün gerçek silüetiyle çizildi (2026-07-20 ikon seti); daireye beyaz stroke basılır.
export const KROKI_SEMBOL_PATH = {
  // Kamera
  dome:      'M3 6h18 M5 6a7 7 0 0 0 14 0 M10.5 9a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0',
  bullet:    'M1.5 8.5h12.5l7 3-7 3H1.5a.5.5 0 0 1-.5-.5v-5a.5.5 0 0 1 .5-.5z M7 14.5V18 M4 18h6',
  ptz:       'M8 2h8 M12 2v3 M7.5 10.5a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0-9 0 M10.8 10.5a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0-2.4 0 M6 19a8 3 0 0 0 12 0 M18 21v-2.5h-2.5',
  speeddome: 'M7 2h10 M12 2v3 M8 10.5a4 4 0 1 0 8 0a4 4 0 1 0-8 0 M10.9 10.5a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0-2.2 0 M2.5 9a9.5 9.5 0 0 0 2.8 6.8 M21.5 9a9.5 9.5 0 0 1-2.8 6.8',
  nvr:       'M3 7h18a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z M6 10.5h6 M6 13.5h4 M16 12a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0',
  // Network
  switch:    'M3 8h18a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z M5.5 13.5v-2 M8.5 13.5v-2 M11.5 13.5v-2 M14.5 13.5v-2 M17.5 13.5v-2',
  cat6:      'M7 2h10v7a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V2z M10 2v3 M12 2v3 M14 2v3 M12 11v3 M12 14c0 4-4.5 3.5-4.5 7',
  fiber:     'M2 21c8.5 0 7.5-13 15-13 M19.5 5l2-2 M20.5 8.5l2.8-.8 M16.5 3.5l.8-2.8',
  ap:        'M4 8a11 11 0 0 1 16 0 M7.5 11.5a7 7 0 0 1 9 0 M9 17.5a3 1.8 0 1 0 6 0a3 1.8 0 1 0-6 0 M12 14v1.7',
  firewall:  'M3 5h18v14H3z M3 9.7h18 M3 14.3h18 M9 5v4.7 M15 9.7v4.6 M9 14.3V19',
  modem:     'M3 12h18a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z M6 15h.01 M9 15h.01 M17 12V5 M14.5 3.5a4 4 0 0 1 5 0',
  backbone:  'M2 7h20 M6 7v5 M12 7v5 M18 7v5 M4.5 12h3v3.5h-3z M10.5 12h3v3.5h-3z M16.5 12h3v3.5h-3z',
  kabin:     'M6 2h12a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z M5 7h14 M5 12h14 M5 17h14 M15.5 4.5h1 M15.5 9.5h1 M15.5 14.5h1',
  pano:      'M5 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M9 6.5v2 M12 6.5v2 M15 6.5v2 M9 12v2 M12 12v2 M15 12v2 M12 17.5h.01',
  ekbuat:    'M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0 M12 4v4 M12 16v4 M4 12h4 M16 12h4',
  menhol:    'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0 M6.5 12a5.5 5.5 0 1 0 11 0a5.5 5.5 0 1 0-11 0 M9.5 9.5l5 5 M9.5 14.5l5-5',
  // PTS & saha
  pts:       'M6 3h8l4.5 2.5L14 8H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M4 13h16a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z M6.5 16.5h3.5 M12.5 16.5h5',
  mobo:      'M3 6h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z M2 10h20 M6 14.5h4',
  kiosk:     'M7 2h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z M9 5h6v5H9z M12 14v6 M8 20h8',
  kapan:     'M2 19h20 M5 19v-7l13 7z M8.5 14.5V19 M12 16v3',
  kasis:     'M2 18h3.5 M18.5 18h3.5 M5.5 18a6.5 6.5 0 0 1 13 0 M9.5 13.5l2-2.5 M12.5 12l2.5 2.5',
  duba:      'M4 19h16 M7 19L10.5 3h3L17 19 M8.7 13h6.6',
  led:       'M3 5h18v11H3z M7 9h.01 M12 9h.01 M17 9h.01 M7 12.5h.01 M12 12.5h.01 M17 12.5h.01 M8 16v3 M16 16v3',
  pc:        'M4 4h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M8 21h8 M12 16v5',
  tv:        'M4 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z M17 2l-5 5-5-5',
  // Turnike
  turnike:       'M4 3h5a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M10 11h9 M10 11l6.5 5.5 M10 11l6.5-5.5',
  kartokuyucu:   'M4 4h8a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z M6 8h4 M8.5 16h.01 M16 9.5a5 5 0 0 1 0 5 M19 7a9 9 0 0 1 0 10',
  gpanel:        'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M9 8h.01 M12 8h.01 M15 8h.01 M9 12h.01 M12 12h.01 M15 12h.01 M9 16h.01 M12 16h.01 M15 16h.01',
  qrokuyucu:     'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h3.5v3.5H14z M20 14v.01 M20 17.5v.01 M17.5 20h.01 M20 20h.01',
  elsensoru:     'M18 11V6a2 2 0 0 0-4 0v5 M14 10V4a2 2 0 0 0-4 0v2 M10 10.5V6a2 2 0 0 0-4 0v8 M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15',
  seperator:     'M5 5v15 M19 5v15 M3 20h4 M17 20h4 M5 8c4.5 3.5 9.5 3.5 14 0',
  manyetikkilit: 'M5 3h4v8a3 3 0 0 0 6 0V3h4v8a7 7 0 0 1-14 0z M5 6.5h4 M15 6.5h4',
  // Santral
  santral:     'M3 5h18a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z M6 9h.01 M10 9h.01 M14 9h.01 M18 9h.01 M6 12.5h12 M8 16v5 M16 16v5',
  telefon:     'M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384',
  mdf:         'M6 3v18 M18 3v18 M6 7.5h12 M6 12h12 M6 16.5h12',
  dectbaz:     'M8 10h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z M12 10V5 M8.8 3.5a5 5 0 0 1 6.4 0 M10.5 14h3',
  decttelefon: 'M9 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M10 7h4 M10 12h.01 M12 12h.01 M14 12h.01 M10 15h.01 M12 15h.01 M14 15h.01 M15.5 3V1.5',
  // Yangın
  dumandedektor:   'M3 4h18 M7.5 4a4.5 3.2 0 0 0 9 0 M9 19c-1-1.2 1-2.3 0-3.5s1-2.3 0-3.5 M14.5 19c-1-1.2 1-2.3 0-3.5s1-2.3 0-3.5',
  isidedektor:     'M3 4h18 M7.5 4a4.5 3.2 0 0 0 9 0 M12 10v6.5 M10 18.5a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  combinededektor: 'M3 4h18 M7.5 4a4.5 3.2 0 0 0 9 0 M8.5 17c-1-1.2 1-2.3 0-3.5 M15.5 11v5 M14 17.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0',
  gazdedektor:     'M17.5 17H9a6 6 0 1 1 5.75-7.7A4 4 0 1 1 17.5 17z M8 21h.01 M12 21h.01 M16 21h.01',
  yanginpaneli:    'M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M12 7c2.2 2 3.4 3.6 3.4 5.6a3.4 3.4 0 0 1-6.8 0C8.6 10.6 9.8 9 12 7z',
  tekrarlayici:    'M9 7h6a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z M2 12h4.5 M4.5 9.5L7 12l-2.5 2.5 M17 12h5 M19.5 9.5L22 12l-2.5 2.5',
  modul:           'M7 7h10v10H7z M10.5 10.5h3v3h-3z M10 7V4 M14 7V4 M10 20v-3 M14 20v-3 M7 10H4 M7 14H4 M20 10h-3 M20 14h-3',
  siren:           'M8 18V10a4 4 0 0 1 8 0v8 M5 18h14 M12 4V2.5 M17.5 5.5L19 4 M6.5 5.5L5 4',
  buton:           'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  // Ses
  tavanhoparlor: 'M3 3h18 M12 3v2 M7.5 12.5a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0-9 0 M10.3 12.5a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0-3.4 0',
  duvarhoparlor: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M9.5 14a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0 M11 7.5a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
  anfi:          'M3 7h18a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z M5 11.5a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0 M10.5 11.5a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0 M16.5 10h3 M16.5 13h3',
  mikrofon:      'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v3',
  // Hemşire çağrı
  ikazlambasi: 'M6 19h12 M8 19v-6a4 4 0 0 1 8 0v6 M12 6V3 M17.5 8.5l2-2 M6.5 8.5l-2-2',
  cagripaneli: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z M12 8.5v7 M8.5 12h7',
  cagributonu: 'M8 8.5a4 4 0 1 0 8 0a4 4 0 1 0-8 0 M10.7 8.5a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0-2.6 0 M12 12.5V21',
  // Hırsız alarm
  alarmsireni:      'M5 5h14a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z M13.5 8l-4 4.5h4L10 17',
  pir:              'M4 3h5a3 3 0 0 1 3 3v2a3 3 0 0 1-3 3H4V3z M6.5 11l-2.5 9 M9.5 11l.5 9.5 M11.5 10l6.5 7',
  manyetikdedektor: 'M4 5h4v14H4z M16 5h4v14h-4z M10.5 9.5h3 M10.5 12h3 M10.5 14.5h3',
  alarmpaneli:      'M5 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M12 6.5l3.5 1.3v2.7c0 2.2-1.5 3.8-3.5 4.5-2-.7-3.5-2.3-3.5-4.5V7.8z M9 18h6',
  // Genel
  guc:     'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z',
  bariyer: 'M15 21V14a2 2 0 0 1 4 0v7 M13 21h8 M16 13 3 7',
  kapi:    'm10 17 5-5-5-5 M15 12H3 M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4',
  // Eski (v1) semboller
  kamera:  'M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z M9 13a3 3 0 1 0 6 0a3 3 0 1 0 -6 0',
  network: 'M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0 M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20 M2 12h20',
}

// Sembol sayımı — kroki + foto şekillerinden { sembolId → adet } (Malzeme/Sembol Özeti)
export const sembolleriSay = (krokiler = [], fotolar = []) => {
  const say = new Map()
  const isle = (sekiller) => {
    for (const s of (sekiller || [])) {
      if (s.tip !== 'sembol' || !s.sembol) continue
      say.set(s.sembol, (say.get(s.sembol) || 0) + 1)
    }
  }
  for (const k of krokiler) isle(k.veri?.sekiller)
  for (const f of fotolar) isle(f.cizimVeri?.sekiller)
  return say
}

export const kesifKrokileriGetir = async (kesifId) => {
  const { data, error } = await supabase
    .from('kesif_krokiler')
    .select('*')
    .eq('kesif_id', kesifId)
    .order('olusturma_tarih', { ascending: true })
  if (error) { console.error('kesifKrokileriGetir:', error.message); return [] }
  return arrayToCamel(data)
}

// Yeni kroki VEYA mevcut krokiyi güncelle: PNG aynı yola upsert, vektör veri satıra
export const kesifKrokiKaydet = async ({ id, kesifId, baslik, veri, pngBlob, mevcutYol, kullanici }) => {
  const yol = mevcutYol || `${kesifId}/kroki/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`
  const { error: upErr } = await supabase.storage.from(FOTO_BUCKET).upload(yol, pngBlob, {
    contentType: 'image/png', cacheControl: '3600', upsert: true,
  })
  if (upErr) throw upErr
  if (id) {
    const { data, error } = await supabase.from('kesif_krokiler').update({
      baslik: baslik || 'Kroki', veri, gorsel_yolu: yol,
      guncelleme_tarih: new Date().toISOString(),
    }).eq('id', id).select()
    if (error) throw error
    if (!data?.length) throw new Error('Kroki güncelleme yetkin yok — yalnız çizen kişi veya yönetici düzenler.')
    return toCamel(data[0])
  }
  const { data, error } = await supabase.from('kesif_krokiler').insert({
    kesif_id: kesifId, baslik: baslik || 'Kroki', veri, gorsel_yolu: yol,
    olusturan_ad: kullanici?.ad || null, olusturan_id: kullanici?.id || null,
  }).select().single()
  if (error) {
    await supabase.storage.from(FOTO_BUCKET).remove([yol]).catch(() => {})
    throw error
  }
  return toCamel(data)
}

export const kesifKrokiSil = async (kroki) => {
  const { data, error } = await supabase.from('kesif_krokiler').delete().eq('id', kroki.id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Silme yetkin yok — krokiyi yalnız çizen kişi veya yönetici silebilir.')
  if (kroki.gorselYolu) await supabase.storage.from(FOTO_BUCKET).remove([kroki.gorselYolu]).catch(() => {})
}

// Signed URL — private bucket
export const kesifFotoUrl = async (dosyaYolu, saniye = 3600) => {
  const { data, error } = await supabase.storage.from(FOTO_BUCKET).createSignedUrl(dosyaYolu, saniye)
  if (error) throw error
  return data.signedUrl
}

// Toplu signed URL (liste görünümü için tek istek)
export const kesifFotoUrlleri = async (yollar, saniye = 3600) => {
  if (!yollar?.length) return new Map()
  const { data, error } = await supabase.storage.from(FOTO_BUCKET).createSignedUrls(yollar, saniye)
  if (error) { console.warn('kesifFotoUrlleri:', error.message); return new Map() }
  return new Map((data || []).filter(d => d.signedUrl).map(d => [d.path, d.signedUrl]))
}
