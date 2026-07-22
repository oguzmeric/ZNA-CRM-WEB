// Destek talepleri — mobil ile AYNI tablo (destek_talepleri), tam senkron.
// Akış: kullanıcı hata bildirir (mesaj + opsiyonel ekran görüntüsü) →
// admin cevaplar (durum: cevaplandi) → kapatılır (kapandi).
// RLS: herkes kendi talebini görür, staff hepsini; update staff.

import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'
import { cokluBildirimEkle } from './bildirimService'

export const DESTEK_DURUM = {
  acik:       { isim: 'Açık',       renk: '#f59e0b', ikon: '🟡' },
  cevaplandi: { isim: 'Cevaplandı', renk: '#3b82f6', ikon: '💬' },
  kapandi:    { isim: 'Kapandı',    renk: '#22c55e', ikon: '✅' },
}

export const destekTalepleriGetir = async () => {
  const { data, error } = await supabase
    .from('destek_talepleri')
    .select('*')
    .order('olusturma_tarih', { ascending: false })
  if (error) { console.error('[destek] liste:', error.message); return [] }
  return arrayToCamel(data || [])
}

export const destekTalepEkle = async ({ kullaniciId, kullaniciAd, mesaj, fotoUrl }) => {
  const { data, error } = await supabase
    .from('destek_talepleri')
    .insert(toSnake({ kullaniciId, kullaniciAd, mesaj, fotoUrl: fotoUrl || null, durum: 'acik' }))
    .select()
    .single()
  if (error) { console.error('[destek] ekle:', error.message); return null }
  // Destek yöneticisine (Oğuz Meriç, id 2) haber ver — tek cevaplayıcı o
  try {
    const DESTEK_YONETICISI_ID = 2
    if (String(kullaniciId) !== String(DESTEK_YONETICISI_ID)) {
      await cokluBildirimEkle([DESTEK_YONETICISI_ID], {
        baslik: `🆘 Yeni destek talebi — ${kullaniciAd}`,
        mesaj: (mesaj || '').slice(0, 90),
        tip: 'destek',
        link: '/destek',
      })
    }
  } catch (e) { console.warn('[destek] yönetici bildirimi:', e?.message) }
  return toCamel(data)
}

export const destekTalepCevapla = async (talep, cevap, cevaplayanAd) => {
  const { data, error } = await supabase
    .from('destek_talepleri')
    .update({ cevap, cevap_tarihi: new Date().toISOString(), durum: 'cevaplandi' })
    .eq('id', talep.id)
    .select()
    .single()
  if (error) { console.error('[destek] cevapla:', error.message); return null }
  // Talep sahibine haber ver (mobil push dahil — bildirimler trigger'ı halleder)
  if (talep.kullaniciId) {
    cokluBildirimEkle([talep.kullaniciId], {
      baslik: `💬 Destek talebiniz yanıtlandı`,
      mesaj: `${cevaplayanAd}: ${(cevap || '').slice(0, 90)}`,
      tip: 'destek',
      link: '/destek',
    }).catch(() => {})
  }
  return toCamel(data)
}

export const destekTalepSil = async (id) => {
  const { error } = await supabase.from('destek_talepleri').delete().eq('id', id)
  if (error) { console.error('[destek] sil:', error.message); return false }
  return true
}

export const destekTalepKapat = async (id) => {
  const { error } = await supabase
    .from('destek_talepleri')
    .update({ durum: 'kapandi' })
    .eq('id', id)
  if (error) { console.error('[destek] kapat:', error.message); return false }
  return true
}

// ─── Sohbet (mig 222) ────────────────────────────────────────────────────────
// Tek 'cevap' kolonu her yanıtta öncekini eziyordu; mesajlar artık burada birikir.
export const DESTEK_YONETICISI_ID = 2

export const destekMesajlariGetir = async (talepId) => {
  if (!talepId) return []
  const { data, error } = await supabase
    .from('destek_mesajlari')
    .select('*')
    .eq('talep_id', talepId)
    .order('olusturma_tarih', { ascending: true })
  if (error) { console.error('[destek] mesajlar:', error.message); return [] }
  return arrayToCamel(data || [])
}

/**
 * Sohbete mesaj ekler. Talep satırını (cevap/durum) YALNIZ destek yöneticisi
 * günceller — RLS'te destek_talepleri UPDATE yalnız id 2'ye açık (mig 189).
 * Karşı tarafa bildirim + mobil push gider.
 */
export const destekMesajEkle = async ({ talep, mesaj, yazarId, yazarAd }) => {
  const metin = (mesaj || '').trim()
  if (!metin || !talep?.id) return null
  const { data, error } = await supabase
    .from('destek_mesajlari')
    .insert(toSnake({ talepId: talep.id, yazarId: yazarId ?? null, yazarAd: yazarAd || '', mesaj: metin }))
    .select()
    .single()
  if (error) { console.error('[destek] mesaj ekle:', error.message); return { hata: error.message } }

  const yoneticiMi = String(yazarId) === String(DESTEK_YONETICISI_ID)
  if (yoneticiMi) {
    await supabase.from('destek_talepleri')
      .update({ cevap: metin, cevap_tarihi: new Date().toISOString(), durum: 'cevaplandi' })
      .eq('id', talep.id)
  }
  try {
    const hedef = yoneticiMi ? talep.kullaniciId : DESTEK_YONETICISI_ID
    if (hedef && String(hedef) !== String(yazarId)) {
      await cokluBildirimEkle([hedef], {
        baslik: yoneticiMi ? '💬 Destek talebiniz yanıtlandı' : `🆘 Destek — ${yazarAd || ''}`,
        mesaj: metin.slice(0, 90),
        tip: 'destek',
        link: '/destek',
      })
    }
  } catch (e) { console.warn('[destek] mesaj bildirimi:', e?.message) }
  return toCamel(data)
}
