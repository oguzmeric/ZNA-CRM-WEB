// Siparişler — kalıcı sipariş kaydı. SADECE Sipariş Onayı verildiğinde INSERT edilir.
// Kaynak: teklif (müşteri kabul etmiş) veya on_siparis (ön sipariş).
// Bkz: supabase_migrations/126_siparisler.sql

import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'
import { cached, invalidate } from '../lib/cache'

export const SIPARIS_DURUMLARI = [
  { id: 'aktif',       isim: 'Aktif',       renk: '#3b82f6' },
  { id: 'tamamlandi',  isim: 'Tamamlandı',  renk: '#10b981' },
  { id: 'iptal',       isim: 'İptal',       renk: '#ef4444' },
]

// ==================== LİSTE ====================
export const siparisleriGetir = () => cached('siparisler:list', async () => {
  const hepsi = []
  const sayfa = 1000
  let off = 0
  while (true) {
    const { data, error } = await supabase
      .from('siparisler')
      .select('*')
      .order('olusturma_tarih', { ascending: false })
      .range(off, off + sayfa - 1)
    if (error) { console.error('siparisleriGetir hata:', error.message); throw error }
    if (!data || data.length === 0) break
    hepsi.push(...data)
    if (data.length < sayfa) break
    off += sayfa
  }
  return arrayToCamel(hepsi)
})

export const siparisGetir = (id) => cached(`siparis:${id}`, async () => {
  const { data, error } = await supabase.from('siparisler').select('*').eq('id', id).single()
  if (error) { console.error('siparisGetir hata:', error.message); return null }
  return toCamel(data)
})

// Bir görüşmeye bağlı siparişler (Görüşme detayında listelemek için)
export const gorusmeninSiparisleri = async (gorusmeId) => {
  const { data, error } = await supabase
    .from('siparisler')
    .select('*')
    .eq('gorusme_id', gorusmeId)
    .order('olusturma_tarih', { ascending: false })
  if (error) return []
  return arrayToCamel(data || [])
}

// Bir müşteriye bağlı siparişler
// Bir firmaya ait birden fazla müşteri kaydı olabildiği için (kişi başına)
// firma verilirse aynı firmadaki tüm müşteri id'lerini toplayıp onlarla sorgular.
export const musteriSiparisleri = async (musteriId, firma) => {
  let idler = [Number(musteriId)]
  if (firma) {
    const { data: aynifirma } = await supabase
      .from('musteriler').select('id').eq('firma', firma)
    const ekstra = (aynifirma || []).map(m => Number(m.id)).filter(Boolean)
    if (ekstra.length > 0) idler = Array.from(new Set([...idler, ...ekstra]))
  }
  const { data, error } = await supabase
    .from('siparisler')
    .select('*')
    .in('musteri_id', idler)
    .order('olusturma_tarih', { ascending: false })
  if (error) return []
  return arrayToCamel(data || [])
}

// ==================== YAZ ====================
export const siparisEkle = async (payload) => {
  const { id, siparisNo, olusturmaTarih, guncellemeTarih, ...rest } = payload
  const { data, error } = await supabase
    .from('siparisler')
    .insert(toSnake(rest))
    .select()
    .single()
  if (error) { console.error('siparisEkle hata:', error.message); return null }
  invalidate('siparisler:list')
  return toCamel(data)
}

export const siparisGuncelle = async (id, payload) => {
  const { id: _id, siparisNo, olusturmaTarih, guncellemeTarih, ...rest } = payload
  const { data, error } = await supabase
    .from('siparisler')
    .update(toSnake(rest))
    .eq('id', id)
    .select()
    .single()
  if (error) { console.error('siparisGuncelle hata:', error.message); return null }
  invalidate('siparisler:list', `siparis:${id}`)
  return toCamel(data)
}

export const siparisSil = async (id) => {
  const { error } = await supabase.from('siparisler').delete().eq('id', id)
  if (error) { console.error('siparisSil hata:', error.message); return false }
  invalidate('siparisler:list', `siparis:${id}`)
  return true
}

/**
 * Siparişi iptal et — durum='iptal' + kaynağa geri döner.
 * - kaynak='on_siparis' → on_sipariş 'onay_bekliyor'a döner (yeniden onaylanabilir)
 * - kaynak='teklif'     → teklif 'musteri_onayladi' state'e döner (spek_durum + eski onay_durumu)
 * Bu sayede yanlış onaylanan sipariş düzeltilip yeniden onaylanabilir.
 */
export const siparisIptalEt = async (id, { iptalSebebi, kullaniciAd } = {}) => {
  // Siparişi çek
  const { data: siparis, error: eGet } = await supabase
    .from('siparisler')
    .select('id, kaynak_tipi, teklif_id, on_siparis_id, durum')
    .eq('id', id)
    .single()
  if (eGet || !siparis) throw eGet || new Error('Sipariş bulunamadı')
  if (siparis.durum === 'iptal') throw new Error('Sipariş zaten iptal.')

  // Siparişi iptal et
  const { error: eU } = await supabase
    .from('siparisler')
    .update({
      durum: 'iptal',
      iptal_sebebi: iptalSebebi || null,
      iptal_eden_ad: kullaniciAd || null,
      iptal_tarih: new Date().toISOString(),
    })
    .eq('id', id)
  if (eU) throw eU

  // Kaynak on_siparişi bekliyor'a döndür
  if (siparis.kaynak_tipi === 'on_siparis' && siparis.on_siparis_id) {
    await supabase
      .from('on_siparisler')
      .update({ durum: 'onay_bekliyor' })
      .eq('id', siparis.on_siparis_id)
  }

  // Kaynak teklifi 'musteri_onayladi' state'e döndür
  // (yönetici tekrar onayladığında yeniden siparişe geçebilir)
  if (siparis.kaynak_tipi === 'teklif' && siparis.teklif_id) {
    await supabase
      .from('teklifler')
      .update({ spek_durum: 'musteri_onayladi', onay_durumu: 'kabul' })
      .eq('id', siparis.teklif_id)
  }

  invalidate('siparisler:list', `siparis:${id}`)
  return true
}

/**
 * Siparişi tamamla — zincirin (görüşme→teklif→sözleşme→sipariş) son adımı.
 * Şema 'tamamlandi'yi baştan beri kabul ediyordu (mig 126) ama bu değeri SET
 * eden hiçbir kod yoktu; Siparişler'deki "Tamamlandı" sekmesi hep boştu.
 * Tamamlama, montaj servisi köprüsünün de tetikleyicisi (mig 168).
 */
export const siparisTamamla = async (id, { kullanici } = {}) => {
  const { data: siparis, error: eGet } = await supabase
    .from('siparisler')
    .select('id, durum')
    .eq('id', id)
    .single()
  if (eGet || !siparis) throw eGet || new Error('Sipariş bulunamadı')
  if (siparis.durum === 'iptal') throw new Error('İptal edilmiş sipariş tamamlanamaz.')
  if (siparis.durum === 'tamamlandi') throw new Error('Sipariş zaten tamamlanmış.')

  const { data, error } = await supabase
    .from('siparisler')
    .update({
      durum: 'tamamlandi',
      tamamlanma_tarihi: new Date().toISOString(),
      tamamlayan_id: kullanici?.id ?? null,
      tamamlayan_ad: kullanici?.ad ?? '',
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  invalidate('siparisler:list', `siparis:${id}`)
  return toCamel(data)
}

// Montaj servisi açıldıktan sonra siparişe geri bağla
export const siparisServisBagla = async (siparisId, servisTalepId) => {
  const { error } = await supabase
    .from('siparisler')
    .update({ servis_talep_id: servisTalepId })
    .eq('id', siparisId)
  if (error) console.error('[siparisServisBagla]', error.message)
  invalidate('siparisler:list', `siparis:${siparisId}`)
}

// ==================== KALEMLER ====================
export const kalemleriGetir = (siparisId) => cached(`siparis-kalem:${siparisId}`, async () => {
  const { data, error } = await supabase
    .from('siparis_kalemleri')
    .select('*')
    .eq('siparis_id', siparisId)
    .order('siralama', { ascending: true })
    .order('id', { ascending: true })
  if (error) { console.error('kalemleriGetir hata:', error.message); return [] }
  return arrayToCamel(data || [])
})

export const kalemEkle = async (kalem) => {
  const { id, olusturmaTarih, ...rest } = kalem
  const { data, error } = await supabase
    .from('siparis_kalemleri')
    .insert(toSnake(rest))
    .select()
    .single()
  if (error) { console.error('kalemEkle hata:', error.message); return null }
  invalidate(`siparis-kalem:${kalem.siparisId}`)
  return toCamel(data)
}

export const kalemleriEkle = async (kalemler) => {
  // Toplu ekleme (onay anında tüm kalemleri tek seferde INSERT etmek için)
  if (!kalemler || kalemler.length === 0) return []
  const payload = kalemler.map(k => {
    const { id, olusturmaTarih, ...rest } = k
    return toSnake(rest)
  })
  const { data, error } = await supabase
    .from('siparis_kalemleri')
    .insert(payload)
    .select()
  if (error) { console.error('kalemleriEkle hata:', error.message); return [] }
  const siparisIds = new Set(kalemler.map(k => k.siparisId).filter(Boolean))
  siparisIds.forEach(sid => invalidate(`siparis-kalem:${sid}`))
  return arrayToCamel(data || [])
}

export const kalemGuncelle = async (id, kalem) => {
  const { id: _id, siparisId, olusturmaTarih, ...rest } = kalem
  const { data, error } = await supabase
    .from('siparis_kalemleri')
    .update(toSnake(rest))
    .eq('id', id)
    .select()
    .single()
  if (error) { console.error('kalemGuncelle hata:', error.message); return null }
  invalidate(`siparis-kalem:${siparisId}`)
  return toCamel(data)
}

export const kalemSil = async (id, siparisId) => {
  const { error } = await supabase.from('siparis_kalemleri').delete().eq('id', id)
  if (error) { console.error('kalemSil hata:', error.message); return false }
  invalidate(`siparis-kalem:${siparisId}`)
  return true
}

// ==================== HESAPLAMA YARDIMCI (client-side) ====================
export const kalemAraToplam = (kalem) => {
  const miktar = Number(kalem?.miktar || 0)
  const fiyat = Number(kalem?.birimFiyat || 0)
  const isk = Number(kalem?.iskontoOrani || 0)
  return miktar * fiyat * (1 - isk / 100)
}

export const kalemlerToplam = (kalemler, genelIskonto = 0) => {
  const araToplam = (kalemler || []).reduce((s, k) => s + kalemAraToplam(k), 0)
  const iskontolu = araToplam - Number(genelIskonto || 0)
  const kdvToplam = (kalemler || []).reduce((s, k) => {
    return s + kalemAraToplam(k) * (Number(k?.kdvOrani || 0) / 100)
  }, 0)
  return {
    araToplam,
    iskontolu,
    kdvToplam,
    genelToplam: iskontolu + kdvToplam,
  }
}
