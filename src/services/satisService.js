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
    // Error → throw (partial data cache'lenmesin, kullanıcı eksik liste görmesin)
    if (error) { console.error('satislariGetir hata:', error.message); throw error }
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
    const { error: satirError } = await supabase.from('satis_satirlari').insert(
      satirlar.map((s, i) => toSnake({ ...s, satisId: satisData.id, sira: i }))
    )
    // Satır insert fail ettiğinde tutarsız kayıt kalmasın — başlığı temizle.
    // Best-effort; cleanup başarısız olsa bile asıl hata fırlatılır.
    if (satirError) {
      console.error('satisEkle satir hata:', satirError.message)
      try { await supabase.from('satislar').delete().eq('id', satisData.id) } catch {}
      throw satirError
    }
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

// Satış sil — ilişkili satir/tahsilat orphan kalmasın diye önce onları temizle
export const satisSil = async (id) => {
  // İlişkili kayıtları sil (DB'de CASCADE garantisi yok)
  await supabase.from('satis_satirlari').delete().eq('satis_id', id)
  await supabase.from('tahsilatlar').delete().eq('satis_id', id)
  const { error } = await supabase.from('satislar').delete().eq('id', id)
  if (error) { console.error('satisSil hata:', error.message); throw error }
  invalidate('satislar:list')
}

// Yardımcı: ödenen toplamı hesapla + durum güncelle.
// .single() hatası destructure edilmediğinde Number(undefined)=NaN → durum
// her zaman 'gonderildi' atanıyordu. Artık error check ediliyor.
const odemeDurumGuncelle = async (satisId) => {
  const { data: tumTahsilatlar, error: tahsilatError } = await supabase
    .from('tahsilatlar').select('tutar').eq('satis_id', satisId)
  if (tahsilatError) { console.error('odemeDurum tahsilat hata:', tahsilatError.message); throw tahsilatError }

  const odenanToplam = (tumTahsilatlar || []).reduce((s, t) => s + Number(t.tutar), 0)

  const { data: satis, error: satisError } = await supabase
    .from('satislar').select('genel_toplam').eq('id', satisId).single()
  if (satisError || !satis) {
    console.error('odemeDurum satis okuma hata:', satisError?.message)
    throw satisError || new Error('Satış bulunamadı: ' + satisId)
  }

  const yeniDurum = odenanToplam >= Number(satis.genel_toplam) ? 'odendi' : 'gonderildi'
  const { error: updError } = await supabase.from('satislar')
    .update({ odenen_toplam: odenanToplam, durum: yeniDurum, updated_at: new Date().toISOString() })
    .eq('id', satisId)
  if (updError) { console.error('odemeDurum update hata:', updError.message); throw updError }
}

// Tahsilat ekle
export const tahsilatEkle = async (tahsilat) => {
  const { data, error } = await supabase.from('tahsilatlar').insert(toSnake(tahsilat)).select().single()
  if (error) { console.error('tahsilatEkle hata:', error.message); throw error }
  await odemeDurumGuncelle(tahsilat.satisId)
  invalidate('satislar:list')
  return toCamel(data)
}

// Tahsilat sil
export const tahsilatSil = async (tahsilatId, satisId) => {
  const { error } = await supabase.from('tahsilatlar').delete().eq('id', tahsilatId)
  if (error) { console.error('tahsilatSil hata:', error.message); throw error }
  await odemeDurumGuncelle(satisId)
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
