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
// Sembol paleti — web + mobil AYNI liste (kod = kroki üstündeki etiket: K1, N1…)
// ikon: Feather adı — mobilde @expo/vector-icons/Feather, web'de lucide karşılığı
export const KROKI_SEMBOLLERI = [
  { id: 'kamera',  kod: 'K',  ikon: 'camera',    ad: 'Kamera',          renk: '#2563eb' },
  { id: 'ptz',     kod: 'P',  ikon: 'video',     ad: 'PTZ Kamera',      renk: '#7c3aed' },
  { id: 'nvr',     kod: 'N',  ikon: 'hard-drive', ad: 'NVR / Kayıt',    renk: '#0f766e' },
  { id: 'switch',  kod: 'S',  ikon: 'server',    ad: 'Switch',          renk: '#0891b2' },
  { id: 'guc',     kod: 'G',  ikon: 'zap',       ad: 'Güç Noktası',     renk: '#ea580c' },
  { id: 'network', kod: 'NT', ikon: 'globe',     ad: 'Network Noktası', renk: '#4f46e5' },
  { id: 'bariyer', kod: 'B',  ikon: 'minus',     ad: 'Bariyer',         renk: '#b91c1c' },
  { id: 'turnike', kod: 'T',  ikon: 'rotate-cw', ad: 'Turnike',         renk: '#a16207' },
  { id: 'kapi',    kod: 'KP', ikon: 'log-in',    ad: 'Kapı',            renk: '#64748b' },
]
export const krokiSembolBilgi = (id) => KROKI_SEMBOLLERI.find(s => s.id === id) || KROKI_SEMBOLLERI[0]

// Tuval sembol ikonu — lucide 24×24 path (canvas Path2D + Skia MakeFromSVGString ortak).
// lucide-react iconNode'larından üretildi (scripts/ikonpath). Sembol dairesine beyaz stroke çizilir.
export const KROKI_SEMBOL_PATH = {
  kamera:  'M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z M9 13a3 3 0 1 0 6 0a3 3 0 1 0 -6 0',
  ptz:     'm16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5 M4 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-8a2 2 0 0 1 2 -2z',
  nvr:     'M10 16h.01 M2.212 11.577a2 2 0 0 0-.212.896V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5.527a2 2 0 0 0-.212-.896L18.55 5.11A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z M21.946 12.013H2.054 M6 16h.01',
  switch:  'M4 2h16a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-4a2 2 0 0 1 2 -2z M4 14h16a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-4a2 2 0 0 1 2 -2z M6 6L6.01 6 M6 18L6.01 18',
  guc:     'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z',
  network: 'M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0 M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20 M2 12h20',
  bariyer: 'M15 21V14a2 2 0 0 1 4 0v7 M13 21h8 M16 13 3 7',
  turnike: 'M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8 M21 3v5h-5',
  kapi:    'm10 17 5-5-5-5 M15 12H3 M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4',
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
