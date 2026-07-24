// Bridge Talepleri — Başakşehir Belediyesi Bridge API'sinden çekilen talepler.
// Veri edge fn 'bridge-senkron' tarafından yazılır; burası okuma + iç triyaj.
// RLS: staff-only (mig 232). Bridge'e YAZMA yok (read-only entegrasyon).

import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'

// Bridge durum kodları (taskStatusId) — güncel kılavuz Bölüm 5 (RESMİ).
export const BRIDGE_DURUM = {
  1:  { isim: 'Başlamadı',      renk: '#94a3b8' },
  2:  { isim: 'Devam Ediyor',   renk: '#3b82f6' },
  3:  { isim: 'Tamamlandı',     renk: '#22c55e' },
  4:  { isim: 'Yeniden Açıldı', renk: '#f59e0b' },
  5:  { isim: 'Reddedildi',     renk: '#ef4444' },
  6:  { isim: 'Başarısız',      renk: '#dc2626' },
  7:  { isim: 'Gerek Kalmadı',  renk: '#64748b' },
  8:  { isim: 'Ek Süre Talebi', renk: '#a855f7' },
  9:  { isim: 'Ek Süre Onayı',  renk: '#8b5cf6' },
  10: { isim: 'Ek Süre Reddi',  renk: '#ef4444' },
  11: { isim: 'Ek Süre İptali', renk: '#94a3b8' },
  12: { isim: 'Kapatıldı',      renk: '#475569' },
  13: { isim: 'Onay Bekliyor',  renk: '#eab308' },
}

export const bridgeDurumBilgi = (id) =>
  BRIDGE_DURUM[id] ?? { isim: id != null ? `Kod ${id}` : '—', renk: '#94a3b8' }

// İç triyaj durumu (CRM tarafı — Bridge'e yansımaz).
export const CRM_DURUM = {
  yeni:        { isim: 'Yeni',        renk: '#3b82f6', ikon: '🆕' },
  incelendi:   { isim: 'İncelendi',   renk: '#a855f7', ikon: '👁️' },
  gorev_acildi:{ isim: 'Görev Açıldı', renk: '#f59e0b', ikon: '📋' },
  kapandi:     { isim: 'Kapandı',     renk: '#22c55e', ikon: '✅' },
}

export const crmDurumBilgi = (d) => CRM_DURUM[d] ?? CRM_DURUM.yeni

// Bridge cevap tarihleri UTC ("…Z"); gösterirken TR yereline çevir.
export const bridgeTarihTR = (iso) => {
  if (!iso) return '—'
  const t = new Date(iso)
  if (isNaN(t.getTime())) return '—'
  return t.toLocaleString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Istanbul',
  })
}

export const bridgeTalepleriGetir = async ({ crmDurum } = {}) => {
  let q = supabase
    .from('bridge_talepler')
    .select('*')
    .order('insert_datetime', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
  if (crmDurum && crmDurum !== 'tumu') q = q.eq('crm_durum', crmDurum)
  const { data, error } = await q
  if (error) { console.error('[bridge] liste:', error.message); return [] }
  return arrayToCamel(data || [])
}

// İç triyaj alanlarını güncelle (atama / durum / not). Bridge'e YAZILMAZ.
export const bridgeTalepGuncelle = async (id, patch) => {
  const { data, error } = await supabase
    .from('bridge_talepler')
    .update(toSnake(patch))
    .eq('id', id)
    .select()
    .single()
  if (error) { console.error('[bridge] guncelle:', error.message); return null }
  return toCamel(data)
}

// Senkron durumu (tek satır) — son çalışma, sonuç, oturum zamanı.
export const bridgeSenkronDurumGetir = async () => {
  const { data, error } = await supabase
    .from('bridge_senkron_durum')
    .select('*')
    .eq('id', 1)
    .maybeSingle()
  if (error) { console.error('[bridge] durum:', error.message); return null }
  return data ? toCamel(data) : null
}

// Edge fn tetikle. mod='test' (tek kayıt, filtresiz doğrulama) | 'liste' (toplu,
// taskTypeIdList gelene kadar GATED → 409 filtre_yok döner).
export const bridgeSenkronCalistir = async (mod = 'test', extra = {}) => {
  const { data, error } = await supabase.functions.invoke('bridge-senkron', {
    body: { mod, ...extra },
  })
  if (error) {
    // functions.invoke non-2xx'te FunctionsHttpError döndürür; gövdeyi de dene.
    let govde = null
    try { govde = await error.context?.json?.() } catch { /* yoksa gec */ }
    return { ok: false, hata: govde?.hata || error.message, aciklama: govde?.aciklama, ...govde }
  }
  return data
}
