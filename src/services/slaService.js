import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'

// Modül listesi (UI'da dropdown için)
export const SLA_MODULLER = [
  { id: 'kargo',  isim: 'Kargo Takip',     ikon: '🚚' },
  { id: 'servis', isim: 'Servis Talebi',    ikon: '🔧' },
  { id: 'gorev',  isim: 'Görev',            ikon: '✅' },
  { id: 'teklif', isim: 'Teklif',           ikon: '📋' },
  { id: 'gorusme', isim: 'Görüşme',         ikon: '📞' },
]

// Modül bazlı durum seçenekleri (UI için)
export const SLA_DURUMLAR = {
  kargo: [
    { id: 'kargoya_verildi', isim: 'Kargoya Verildi' },
    { id: 'dagitimda',       isim: 'Dağıtımda' },
    { id: 'teslim_edildi',   isim: 'Teslim Edildi' },
  ],
  servis: [
    { id: 'inceleniyor',   isim: 'İncelemeye Alındı' },
    { id: 'atandi',        isim: 'Atandı' },
    { id: 'devam_ediyor',  isim: 'Devam Ediyor' },
    { id: 'tamamlandi',    isim: 'Tamamlandı' },
  ],
  gorev: [
    { id: 'devam_ediyor',  isim: 'Devam Ediyor' },
    { id: 'tamamlandi',    isim: 'Tamamlandı' },
  ],
  teklif: [
    { id: 'gonderildi',   isim: 'Gönderildi' },
    { id: 'kabul',         isim: 'Kabul Edildi' },
  ],
  gorusme: [
    { id: 'kapali',        isim: 'Kapalı' },
  ],
}

// CRUD ==========================================================

export const slaKurallariGetir = async () => {
  const { data, error } = await supabase
    .from('sla_kurallari')
    .select('*')
    .order('modul')
    .order('sure_saat')
  if (error) { console.error('slaKurallariGetir hata:', error.message); return [] }
  return arrayToCamel(data) ?? []
}

export const slaKuralGetir = async (id) => {
  const { data, error } = await supabase.from('sla_kurallari').select('*').eq('id', id).single()
  if (error) { console.error('slaKuralGetir hata:', error.message); return null }
  return toCamel(data)
}

export const slaKuralEkle = async (kural) => {
  const { id, olusturmaTarih, ...rest } = kural
  const { data, error } = await supabase
    .from('sla_kurallari')
    .insert(toSnake(rest))
    .select()
    .single()
  if (error) { console.error('slaKuralEkle hata:', error.message); throw error }
  return toCamel(data)
}

export const slaKuralGuncelle = async (id, guncellenmis) => {
  const { id: _id, olusturmaTarih, ...rest } = guncellenmis
  const { data, error } = await supabase
    .from('sla_kurallari')
    .update(toSnake(rest))
    .eq('id', id)
    .select()
    .single()
  if (error) { console.error('slaKuralGuncelle hata:', error.message); throw error }
  return toCamel(data)
}

export const slaKuralSil = async (id) => {
  const { error } = await supabase.from('sla_kurallari').delete().eq('id', id)
  if (error) console.error('slaKuralSil hata:', error.message)
}

// PERFORMANS HESAPLAMA ==========================================

/**
 * Bir işin SLA durumunu hesaplar.
 * @param {string} baslangic - ISO tarih (iş oluşturma / atanma anı)
 * @param {string|null} bitis - ISO tarih (iş tamamlanma anı, null ise şu an)
 * @param {number} slaSaat - SLA süresi
 * @returns { durum: 'zamaninda' | 'gec' | 'kritik' | 'acik', gecikme_saat: number }
 */
export const slaDurumHesapla = (baslangic, bitis, slaSaat) => {
  if (!baslangic || !slaSaat) return null
  const bas = new Date(baslangic)
  const son = bitis ? new Date(bitis) : new Date()
  const farkSaat = (son - bas) / (1000 * 60 * 60)

  if (bitis) {
    // İş tamamlandı
    if (farkSaat <= slaSaat) return { durum: 'zamaninda', gecikmeSaat: 0, kullanilanSaat: farkSaat }
    return { durum: 'gec', gecikmeSaat: farkSaat - slaSaat, kullanilanSaat: farkSaat }
  } else {
    // İş açık
    if (farkSaat <= slaSaat) return { durum: 'acik', gecikmeSaat: 0, kullanilanSaat: farkSaat, kalanSaat: slaSaat - farkSaat }
    return { durum: 'kritik', gecikmeSaat: farkSaat - slaSaat, kullanilanSaat: farkSaat }
  }
}

/**
 * Kullanıcı performans hesaplama — işler listesinden skor üretir
 * @param {Array} isler - { modul, baslangic, bitis, slaSaat, kullaniciId } array
 * @returns { kullaniciId: { zamaninda: N, gec: N, acik: N, kritik: N, skor: % } }
 */
export const performansHesapla = (isler, slaKurallari) => {
  const rapor = new Map()

  isler.forEach(is => {
    // İş için uygun SLA kuralını bul
    const kural = slaKurallari.find(k =>
      k.aktif && k.modul === is.modul && k.bitisDurum === is.hedefDurum
    )
    if (!kural) return

    const sonuc = slaDurumHesapla(is.baslangic, is.bitis, kural.sureSaat)
    if (!sonuc) return

    const k = is.kullaniciId
    if (!rapor.has(k)) rapor.set(k, { zamaninda: 0, gec: 0, acik: 0, kritik: 0, toplam: 0, detaylar: [] })
    const kayit = rapor.get(k)
    kayit[sonuc.durum]++
    kayit.toplam++
    kayit.detaylar.push({ ...is, ...sonuc, kural })
  })

  // Skor hesapla: (zamanında + 0.5 * açık) / tamamlanan iş sayısı
  for (const [, r] of rapor.entries()) {
    const tamamlanan = r.zamaninda + r.gec
    r.skor = tamamlanan > 0 ? Math.round((r.zamaninda / tamamlanan) * 100) : null
  }

  return rapor
}
