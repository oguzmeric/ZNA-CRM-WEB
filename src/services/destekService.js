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
  // Adminlere haber ver — panelden cevaplasınlar
  try {
    const { data: adminler } = await supabase
      .from('kullanicilar').select('id').eq('tip', 'zna').eq('rol', 'admin')
    const alicilar = (adminler || []).map(k => k.id).filter(id => String(id) !== String(kullaniciId))
    if (alicilar.length) {
      await cokluBildirimEkle(alicilar, {
        baslik: `🆘 Yeni destek talebi — ${kullaniciAd}`,
        mesaj: (mesaj || '').slice(0, 90),
        tip: 'destek',
        link: '/destek',
      })
    }
  } catch (e) { console.warn('[destek] admin bildirim:', e?.message) }
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

export const destekTalepKapat = async (id) => {
  const { error } = await supabase
    .from('destek_talepleri')
    .update({ durum: 'kapandi' })
    .eq('id', id)
  if (error) { console.error('[destek] kapat:', error.message); return false }
  return true
}
