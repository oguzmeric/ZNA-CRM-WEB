import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'
import { cached, invalidate, invalidatePrefix } from '../lib/cache'

// Fatura no üret: FAT-2026-001
export const yeniFaturaNo = async () => {
  const yil = new Date().getFullYear()
  const { data } = await supabase
    .from('satislar')
    .select('fatura_no')
    .ilike('fatura_no', `FAT-${yil}-%`)
    .order('fatura_no', { ascending: false })
    .limit(1)
  const son = data?.[0]?.fatura_no
  const sonSira = son ? parseInt(son.split('-')[2]) : 0
  return `FAT-${yil}-${String(sonSira + 1).padStart(3, '0')}`
}

// Satışları getir (satirlarla birlikte)
export const satislariGetir = () => cached('satislar:list', async () => {
  const satisData = []
  const sayfa = 1000
  let off = 0
  while (true) {
    const { data, error } = await supabase
      .from('satislar')
      .select('*')
      .order('created_at', { ascending: false })
      .range(off, off + sayfa - 1)
    if (error) { console.error('satislariGetir hata:', error.message); break }
    if (!data || data.length === 0) break
    satisData.push(...data)
    if (data.length < sayfa) break
    off += sayfa
  }
  if (!satisData.length) return []

  const ids = satisData.map(s => s.id)
  const { data: satirData } = await supabase.from('satis_satirlari').select('*').in('satis_id', ids)
  const { data: tahsilatData } = await supabase.from('tahsilatlar').select('*').in('satis_id', ids)

  return satisData.map(row => ({
    ...toCamel(row),
    faturaTarihi: normalizeDate(row.fatura_tarihi),
    vadeTarihi: normalizeDate(row.vade_tarihi),
    satirlar: arrayToCamel((satirData || []).filter(s => s.satis_id === row.id)),
    tahsilatlar: arrayToCamel((tahsilatData || []).filter(t => t.satis_id === row.id)),
  }))
})

// Date string normalize (YYYY-MM-DD)
const normalizeDate = (d) => {
  if (!d) return ''
  return d.split('T')[0]
}

// Tek satış getir
export const satisGetir = async (id) => {
  const { data } = await supabase
    .from('satislar')
    .select('*')
    .eq('id', id)
    .single()
  if (!data) return null

  const { data: satirData } = await supabase.from('satis_satirlari').select('*').eq('satis_id', id)
  const { data: tahsilatData } = await supabase.from('tahsilatlar').select('*').eq('satis_id', id)

  const row = toCamel(data)
  return {
    ...row,
    faturaTarihi: normalizeDate(data.fatura_tarihi),
    vadeTarihi: normalizeDate(data.vade_tarihi),
    satirlar: arrayToCamel(satirData || []),
    tahsilatlar: arrayToCamel(tahsilatData || []),
  }
}

// Satış oluştur
export const satisEkle = async (satis) => {
  const { satirlar, tahsilatlar, ...rest } = satis
  const { data: satisData, error } = await supabase
    .from('satislar')
    .insert(toSnake(rest))
    .select()
    .single()
  if (error) throw error

  if (satirlar?.length) {
    await supabase.from('satis_satirlari').insert(
      satirlar.map((s, i) => toSnake({ ...s, satisId: satisData.id, sira: i }))
    )
  }
  invalidate('satislar:list')
  return toCamel(satisData)
}

// Satış güncelle
export const satisGuncelle = async (id, satis) => {
  const { satirlar, tahsilatlar, ...rest } = satis
  const tumSnake = { ...toSnake(rest), updated_at: new Date().toISOString() }

  // Sadece bilinen satislar sütunlarını gönder
  const izinliSutunlar = [
    'fatura_no', 'firma_adi', 'musteri_yetkili', 'musteri_email', 'musteri_telefon',
    'fatura_tarihi', 'vade_tarihi', 'durum', 'para_birimi', 'notlar', 'aciklama',
    'teklif_id', 'teklif_no', 'ara_toplam', 'iskonto_toplam', 'kdv_toplam',
    'genel_toplam', 'odenen_toplam', 'updated_at',
  ]
  const guncellenecek = Object.fromEntries(
    Object.entries(tumSnake).filter(([k]) => izinliSutunlar.includes(k))
  )

  console.log('satisGuncelle payload:', guncellenecek)
  const { data, error } = await supabase
    .from('satislar')
    .update(guncellenecek)
    .eq('id', id)
    .select()
    .single()

  if (error) { console.error('satisGuncelle hata:', error.message); throw error }

  if (satirlar !== undefined) {
    await supabase.from('satis_satirlari').delete().eq('satis_id', id)
    if (satirlar.length) {
      const { error: satirError } = await supabase.from('satis_satirlari').insert(
        satirlar.map((s, i) => toSnake({ ...s, satisId: id, sira: i }))
      )
      if (satirError) console.error('Satır kayıt hatası:', satirError.message)
    }
  }
  invalidate('satislar:list')
  return toCamel(data)
}

// Satış sil
export const satisSil = async (id) => {
  await supabase.from('satislar').delete().eq('id', id)
  invalidate('satislar:list')
}

// Tahsilat ekle
export const tahsilatEkle = async (tahsilat) => {
  const { data } = await supabase.from('tahsilatlar').insert(toSnake(tahsilat)).select().single()
  // Odenen toplami guncelle
  const { data: tumTahsilatlar } = await supabase
    .from('tahsilatlar')
    .select('tutar')
    .eq('satis_id', tahsilat.satisId)
  const odenanToplam = (tumTahsilatlar || []).reduce((s, t) => s + Number(t.tutar), 0)
  const { data: satis } = await supabase.from('satislar').select('genel_toplam').eq('id', tahsilat.satisId).single()
  const yeniDurum = odenanToplam >= Number(satis?.genel_toplam) ? 'odendi' : 'gonderildi'
  await supabase.from('satislar').update({ odenen_toplam: odenanToplam, durum: yeniDurum, updated_at: new Date().toISOString() }).eq('id', tahsilat.satisId)
  invalidate('satislar:list')
  return toCamel(data)
}

// Tahsilat sil
export const tahsilatSil = async (tahsilatId, satisId) => {
  await supabase.from('tahsilatlar').delete().eq('id', tahsilatId)
  const { data: tumTahsilatlar } = await supabase.from('tahsilatlar').select('tutar').eq('satis_id', satisId)
  const odenanToplam = (tumTahsilatlar || []).reduce((s, t) => s + Number(t.tutar), 0)
  const { data: satis } = await supabase.from('satislar').select('genel_toplam').eq('id', satisId).single()
  const yeniDurum = odenanToplam >= Number(satis?.genel_toplam) ? 'odendi' : 'gonderildi'
  await supabase.from('satislar').update({ odenen_toplam: odenanToplam, durum: yeniDurum, updated_at: new Date().toISOString() }).eq('id', satisId)
  invalidate('satislar:list')
}

// Fatura gönderildiğinde stok düşümü
export const stokDusumYap = async (satirlar, faturaNo, firmaAdi) => {
  const stokluSatirlar = (satirlar || []).filter((s) => s.stokKodu && s.stokKodu.trim())
  if (!stokluSatirlar.length) return

  const bugun = new Date().toISOString().split('T')[0]
  for (const satir of stokluSatirlar) {
    try {
      await supabase.from('stok_hareketleri').insert({
        stok_kodu: satir.stokKodu,
        hareket_tipi: 'cikis',
        miktar: satir.miktar,
        aciklama: `Satış Faturası: ${faturaNo} — ${firmaAdi || ''}`,
        tarih: bugun,
      })
    } catch (e) {
      console.warn('Stok hareketi eklenemedi:', e)
    }
  }
}
