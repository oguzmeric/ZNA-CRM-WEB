// Satış Sözleşmesi Otomasyon Modülü servisi (mig 156).
// Akış (spec §8): taslak → yönetici onayına gönder → onayla (KİLİTLENİR) →
// müşteriye gönder → imzalı PDF yüklenir → bağlı sipariş "Sözleşmeli Sipariş" olur.

import { supabase } from '../lib/supabase'
import { toCamel, arrayToCamel, toSnake } from '../lib/mapper'
import { cokluBildirimEkle } from './bildirimService'
import { sozlesmeHesapla } from '../lib/satisSozlesmeHesap'
import { sozlesmeHtmlUret, evrakListesiUret } from '../lib/satisSozlesmeMaddeleri'

export const satisSozlesmeleriGetir = async () => {
  const { data, error } = await supabase
    .from('satis_sozlesmeleri').select('*').order('id', { ascending: false })
  if (error) { console.error('satisSozlesmeleriGetir hata:', error.message); return [] }
  return arrayToCamel(data || [])
}

export const satisSozlesmeGetir = async (id) => {
  const { data, error } = await supabase
    .from('satis_sozlesmeleri').select('*').eq('id', id).single()
  if (error) { console.error('satisSozlesmeGetir hata:', error.message); return null }
  return toCamel(data)
}

export const satisSozlesmeEkle = async (payload) => {
  const { data, error } = await supabase
    .from('satis_sozlesmeleri').insert(toSnake(payload)).select().single()
  if (error) {
    // mig 186 unique index — aynı tekliften ikinci aktif sözleşme
    if (error.code === '23505' || error.message?.includes('uq_satis_sozlesme_aktif_teklif')) {
      return { _hata: 'Bu tekliften zaten bir sözleşme oluşturulmuş. Aynı teklife ikinci sözleşme açılamaz.' }
    }
    return { _hata: error.message }
  }
  return toCamel(data)
}

// Teklif başına tek sözleşme kuralı — iptal edilmemiş sözleşmeyi bulur (mig 186).
// mig 247: teklif ana kolonda DEĞİL, çoklu teklif ara tablosunda 2. sırada da olabilir;
// yalnız teklif_id'ye bakmak "sözleşmesi yok" yanılgısı üretirdi.
export const teklifinAktifSozlesmesi = async (teklifId) => {
  if (!teklifId) return null
  const { data, error } = await supabase
    .from('satis_sozlesmeleri')
    .select('id, sozlesme_no, durum')
    .eq('teklif_id', Number(teklifId))
    .neq('durum', 'iptal')
    .limit(1)
  if (error) { console.error('teklifinAktifSozlesmesi hata:', error.message); return null }
  if (data?.[0]) return toCamel(data[0])

  const { data: baglar } = await supabase
    .from('satis_sozlesme_teklifleri').select('sozlesme_id').eq('teklif_id', Number(teklifId))
  const idler = [...new Set((baglar || []).map(b => b.sozlesme_id).filter(Boolean))]
  if (!idler.length) return null
  const { data: sozler } = await supabase
    .from('satis_sozlesmeleri').select('id, sozlesme_no, durum')
    .in('id', idler).neq('durum', 'iptal').limit(1)
  return sozler?.[0] ? toCamel(sozler[0]) : null
}

// ---------- Çoklu teklif (mig 247) ----------
// Bir binanın yangın / kamera / kartlı geçiş / ses sistemi ayrı tekliflenip TEK
// sözleşmeye bağlanabilir. Ara tablo tek doğru kaynak; satis_sozlesmeleri.teklif_id
// ve teklif_no DB trigger'ı ile buradan türetilir.

export const sozlesmeTeklifleriGetir = async (sozlesmeId) => {
  if (!sozlesmeId) return []
  const { data, error } = await supabase
    .from('satis_sozlesme_teklifleri').select('*')
    .eq('sozlesme_id', Number(sozlesmeId))
    .order('sira', { ascending: true }).order('id', { ascending: true })
  if (error) { console.error('sozlesmeTeklifleriGetir hata:', error.message); return [] }
  return arrayToCamel(data || [])
}

/** Form'daki teklif listesini ara tabloya yansıtır (ekle / güncelle / sil). */
export const sozlesmeTekliflerimiKaydet = async (sozlesmeId, liste) => {
  if (!sozlesmeId) return { _hata: 'Sözleşme kaydedilmeden teklif bağlanamaz.' }
  const hedef = (liste || []).filter(t => t?.teklifId)
  const mevcut = await sozlesmeTeklifleriGetir(sozlesmeId)
  const hedefIdler = new Set(hedef.map(t => Number(t.teklifId)))
  const hatalar = []

  for (const m of mevcut) {
    if (hedefIdler.has(Number(m.teklifId))) continue
    const { error } = await supabase.from('satis_sozlesme_teklifleri').delete().eq('id', m.id)
    if (error) hatalar.push(`${m.teklifNo || m.teklifId} kaldırılamadı: ${error.message}`)
  }

  const mevcutMap = new Map(mevcut.map(m => [Number(m.teklifId), m]))
  for (let i = 0; i < hedef.length; i++) {
    const t = hedef[i]
    const satir = {
      sozlesme_id: Number(sozlesmeId),
      teklif_id: Number(t.teklifId),
      teklif_no: t.teklifNo || null,
      firma_adi: t.firmaAdi || null,
      konu: t.konu || null,
      tutar: Number(t.tutar) || 0,
      urun_listesi: t.urunListesi || [],
      sira: i,
    }
    const eski = mevcutMap.get(Number(t.teklifId))
    const { error } = eski
      ? await supabase.from('satis_sozlesme_teklifleri').update(satir).eq('id', eski.id)
      : await supabase.from('satis_sozlesme_teklifleri').insert(satir)
    // Tekillik trigger'ı burada konuşur: "Bu teklif zaten ZNA-SS-... sözleşmesine bağlı"
    if (error) hatalar.push(`${t.teklifNo || t.teklifId}: ${error.message}`)
  }
  return hatalar.length ? { _hata: hatalar.join(' · ') } : { ok: true }
}

/** Teklif kaydını sözleşme teklif satırına çevirir (tutar + kalemler dondurulur). */
export const teklifiSozlesmeSatiri = (teklif, gorusmeNo = '') => {
  const veri = tekliftenForm(teklif, gorusmeNo)
  return {
    teklifId: teklif.id,
    teklifNo: teklif.teklifNo || '',
    firmaAdi: teklif.firmaAdi || '',
    konu: teklif.konu || '',
    tutar: veri.anaToplam,
    paraBirimi: veri.paraBirimi,
    urunListesi: veri.urunListesi,
  }
}

/**
 * Farklı para birimli teklifler tek sözleşmede TOPLANAMAZ — 9.152 EUR + 45.599 USD
 * matematiksel olarak anlamsız bir "86.094" üretir. Kur çevirmek de yanlış olur
 * (hangi kur, hangi tarih?). Bu yüzden ekleme aşamasında engelliyoruz.
 * @returns hata metni ya da null
 */
export const paraBirimiCakismasi = (mevcutSatirlar, yeniSatir, formParaBirimi) => {
  const mevcut = (mevcutSatirlar || []).map(t => t.paraBirimi).filter(Boolean)
  const referans = mevcut[0] || formParaBirimi || 'TL'
  const yeni = yeniSatir?.paraBirimi || 'TL'
  if (!mevcut.length && !formParaBirimi) return null
  if (yeni === referans) return null
  return `${yeniSatir?.teklifNo || 'Teklif'} ${yeni} cinsinden, sözleşme ${referans} cinsinden. ` +
    `Farklı para birimli teklifler tek sözleşmede toplanamaz — ayrı sözleşme açın.`
}

/**
 * Bir teklifin bağlanabileceği MEVCUT sözleşmeler (aynı müşteri, hâlâ düzenlenebilir).
 * Onaylanmış/imzalanmış sözleşme kilitlidir — belgesi dondurulmuştur, teklif eklenmez.
 * Tekliflerin bir kısmında musteri_id boş olduğu için firma adıyla da eşleştiriyoruz.
 */
export const eklenebilirSozlesmeler = async ({ musteriId, firmaAdi }) => {
  const { data, error } = await supabase
    .from('satis_sozlesmeleri')
    .select('id, sozlesme_no, durum, kilitli, musteri_id, firma_adi, proje_adi, isin_konusu, ana_toplam, para_birimi, teklif_no')
    .in('durum', ['taslak', 'yonetici_onayinda'])
    .order('id', { ascending: false })
  if (error) { console.error('eklenebilirSozlesmeler hata:', error.message); return [] }
  const norm = (s) => (s || '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim()
  const hedefFirma = norm(firmaAdi)
  return arrayToCamel(data || []).filter(s =>
    !s.kilitli && (
      (musteriId && Number(s.musteriId) === Number(musteriId)) ||
      (hedefFirma && norm(s.firmaAdi) === hedefFirma)
    )
  )
}

/**
 * Teklifi MEVCUT bir sözleşmeye bağlar ve sözleşmenin tutarını / ürün listesini /
 * belge içeriğini yeniden üretir. Bu son adım olmadan ara tabloya satır girer ama
 * sözleşme bedeli eski kalırdı — kullanıcı elle "Kaydet"e basana kadar tutarsız görünür.
 */
export const teklifiSozlesmeyeEkle = async (sozlesmeId, teklif, gorusmeNo = '') => {
  const sozlesme = await satisSozlesmeGetir(Number(sozlesmeId))
  if (!sozlesme) return { _hata: 'Sözleşme okunamadı.' }
  if (sozlesme.kilitli || !['taslak', 'yonetici_onayinda'].includes(sozlesme.durum)) {
    return { _hata: `${sozlesme.sozlesmeNo} kilitli — teklif eklemek için yönetici kilidi açmalı.` }
  }

  const mevcut = await sozlesmeTeklifleriGetir(sozlesmeId)
  if (mevcut.some(t => Number(t.teklifId) === Number(teklif.id))) {
    return { _hata: 'Bu teklif zaten bu sözleşmede bağlı.' }
  }

  const satir = teklifiSozlesmeSatiri(teklif, gorusmeNo)
  const cakisma = paraBirimiCakismasi(mevcut, satir, sozlesme.paraBirimi)
  if (cakisma) return { _hata: cakisma }

  const { error } = await supabase.from('satis_sozlesme_teklifleri').insert({
    sozlesme_id: Number(sozlesmeId),
    teklif_id: Number(satir.teklifId),
    teklif_no: satir.teklifNo || null,
    firma_adi: satir.firmaAdi || null,
    konu: satir.konu || null,
    tutar: satir.tutar,
    urun_listesi: satir.urunListesi || [],
    sira: mevcut.length,
  })
  // Tekillik trigger'ı reddederse sebebi doğrudan kullanıcıya taşıyoruz
  if (error) return { _hata: error.message }

  // Ana kolonlar trigger'la senkronlandı; tutar/ürün/belge burada tazelenir
  const [taze, bagli] = await Promise.all([
    satisSozlesmeGetir(sozlesmeId),
    sozlesmeTeklifleriGetir(sozlesmeId),
  ])
  const birlesik = tekliflerdenBirlesik(bagli)
  const guncelForm = {
    ...taze,
    sozlesmeTeklifleri: bagli,
    anaToplam: birlesik.anaToplam || taze.anaToplam,
    urunListesi: birlesik.urunListesi,
  }
  const hazir = hesapVeIcerikHazirla(guncelForm)
  const sonuc = await satisSozlesmeGuncelle(sozlesmeId, {
    anaToplam: hazir.anaToplam, vadeFarki: hazir.vadeFarki,
    damgaVergisi: hazir.damgaVergisi, nihaiToplam: hazir.nihaiToplam,
    urunListesi: birlesik.urunListesi, uretilenIcerik: hazir.uretilenIcerik,
  })
  if (sonuc?._hata) return sonuc
  return { ...sonuc, _eklenenTeklifNo: satir.teklifNo, _teklifSayisi: bagli.length }
}

/** Bağlı tekliflerin kalemlerini ve toplamlarını tek sözleşme gövdesinde birleştirir. */
export const tekliflerdenBirlesik = (satirlar) => {
  const liste = (satirlar || []).filter(Boolean)
  const urunListesi = liste.flatMap(t =>
    (t.urunListesi || []).map(u => ({ ...u, teklifNo: t.teklifNo || '' }))
  )
  return {
    urunListesi,
    anaToplam: r2(liste.reduce((a, t) => a + (Number(t.tutar) || 0), 0)),
    teklifNo: liste.map(t => t.teklifNo).filter(Boolean).join(', '),
    teklifId: liste[0]?.teklifId || null,
    paraBirimi: liste[0]?.paraBirimi || null,
  }
}

export const satisSozlesmeGuncelle = async (id, patch) => {
  const { data, error } = await supabase
    .from('satis_sozlesmeleri')
    .update({ ...toSnake(patch), guncelleme_tarih: new Date().toISOString() })
    .eq('id', id).select().single()
  if (error) return { _hata: error.message }
  return toCamel(data)
}

// Hesapları uygula + içerik HTML'ini üret (kayıt öncesi tek noktadan)
export const hesapVeIcerikHazirla = (form) => {
  const hesap = sozlesmeHesapla(form)
  const evraklar = form.evraklar?.length
    ? form.evraklar
    // odemePlani: parçalı planda çek satırı varsa çek fotokopisi de istenir (mig 247)
    : evrakListesiUret({
      firmaTipi: form.firmaTipi, odemeTipi: form.odemeTipi,
      odemePlani: form.odemePlani, imzaBelgesiIstenir: form.imzaBelgesiIstenir,
    })
  // Logo göreli tutulur — uygulama içinde doğrudan, yazdırma penceresinde <base> ile çözülür
  const icerik = sozlesmeHtmlUret({ ...form, ...hesap, evraklar }, { logoUrl: '/logo.jpeg' })
  return { ...hesap, evraklar, uretilenIcerik: icerik }
}

// ---------- Durum geçişleri ----------

export const onayaGonder = async (sozlesme, kullanici) => {
  const g = await satisSozlesmeGuncelle(sozlesme.id, {
    durum: 'yonetici_onayinda',
    onayaGonderimTarihi: new Date().toISOString(),
    redSebebi: null,
  })
  if (g?._hata) return g
  bildirimGonder(null, 'Satış sözleşmesi onay bekliyor',
    `${sozlesme.sozlesmeNo} — ${sozlesme.firmaAdi || ''} (${kullanici?.ad || 'personel'} hazırladı). Oran, vade ve iskonto kontrolü gerekiyor.`)
  return g
}

// Yönetici onayı: sözleşme KİLİTLENİR (spec §8/5)
export const sozlesmeOnayla = async (sozlesme, kullanici) => {
  const g = await satisSozlesmeGuncelle(sozlesme.id, {
    durum: 'onaylandi',
    kilitli: true,
    onaylayanId: kullanici?.id || null,
    onaylayanAd: kullanici?.ad || null,
    onayTarihi: new Date().toISOString(),
  })
  if (g?._hata) return g
  bildirimGonder(sozlesme.hazirlayanId, 'Satış sözleşmesi onaylandı',
    `${sozlesme.sozlesmeNo} yönetici tarafından onaylandı ve kilitlendi. Müşteriye gönderebilirsiniz.`)
  return g
}

export const sozlesmeReddet = async (sozlesme, kullanici, sebep) => {
  const g = await satisSozlesmeGuncelle(sozlesme.id, {
    durum: 'taslak', kilitli: false, redSebebi: sebep || null,
  })
  if (g?._hata) return g
  bildirimGonder(sozlesme.hazirlayanId, 'Satış sözleşmesi reddedildi',
    `${sozlesme.sozlesmeNo} — ${kullanici?.ad || 'yönetici'}: ${sebep || 'sebep belirtilmedi'}`)
  return g
}

export const gonderildiIsaretle = (id) => satisSozlesmeGuncelle(id, {
  durum: 'gonderildi', gonderimTarihi: new Date().toISOString(),
})

export const sozlesmeIptalEt = (id) => satisSozlesmeGuncelle(id, { durum: 'iptal', kilitli: false })

/**
 * Sözleşmeyi KALICI sil (yalnız admin). İptal etmek kaydı arşivde tutar; silmek
 * geri alınamaz — hatalı/deneme kayıtlarını temizlemek için.
 * Bağlı teklif satırları FK cascade ile gider; sipariş işareti ve storage
 * dosyaları burada elle temizlenir (yoksa öksüz kalırlar).
 */
export const satisSozlesmeSil = async (sozlesmeVeyaId) => {
  const id = typeof sozlesmeVeyaId === 'object' ? sozlesmeVeyaId.id : sozlesmeVeyaId
  if (!id) return { _hata: 'Sözleşme bulunamadı.' }

  // "Sözleşmeli Sipariş" rozeti silinen sözleşmeye işaret etmesin
  await supabase.from('siparisler').update({ sozlesme_id: null }).eq('sozlesme_id', id)

  // İmzalı PDF + yüklenen evraklar (satis-sozlesme/<id>/…)
  try {
    const { data: dosyalar } = await supabase.storage.from('satis-sozlesme').list(String(id))
    if (dosyalar?.length) {
      await supabase.storage.from('satis-sozlesme').remove(dosyalar.map(d => `${id}/${d.name}`))
    }
  } catch (e) {
    console.warn('[satisSozlesmeSil] dosya temizliği:', e?.message)
  }

  const { error } = await supabase.from('satis_sozlesmeleri').delete().eq('id', id)
  if (error) return { _hata: error.message }
  return { ok: true }
}

/**
 * Kilidi aç (yalnız admin) — revizyon için taslağa döner.
 *
 * mig 248: İMZALANMIŞ sözleşmede de çalışır. İmzalı belgeyi tahrip etmeden:
 * eski imzalı PDF + imza tarihi imza_gecmisi'ne taşınır, revizyon_no artar,
 * imza alanları temizlenir (yeniden imza istenecek). "Müşteri hangi metni
 * imzalamıştı?" sorusu böylece her zaman cevaplanabilir kalır.
 */
export const kilidiAc = async (idVeyaKayit, kullanici, sebep = '') => {
  const id = typeof idVeyaKayit === 'object' ? idVeyaKayit.id : idVeyaKayit
  const sozlesme = typeof idVeyaKayit === 'object' ? idVeyaKayit : await satisSozlesmeGetir(id)
  if (!sozlesme) return { _hata: 'Sözleşme okunamadı.' }

  const patch = { durum: 'taslak', kilitli: false }

  if (sozlesme.durum === 'imzalandi') {
    const gecmis = Array.isArray(sozlesme.imzaGecmisi) ? sozlesme.imzaGecmisi : []
    patch.imzaGecmisi = [...gecmis, {
      revizyon: Number(sozlesme.revizyonNo) || 0,
      imzaliPdfUrl: sozlesme.imzaliPdfUrl || null,
      imzaliPdfAd: sozlesme.imzaliPdfAd || null,
      imzaTarihi: sozlesme.imzaTarihi || null,
      nihaiToplam: sozlesme.nihaiToplam ?? null,
      paraBirimi: sozlesme.paraBirimi || 'TL',
      teklifNo: sozlesme.teklifNo || null,
      acanId: kullanici?.id || null,
      acanAd: kullanici?.ad || null,
      acmaTarihi: new Date().toISOString(),
      sebep: sebep || null,
    }]
    patch.revizyonNo = (Number(sozlesme.revizyonNo) || 0) + 1
    // Yeni sürüm yeniden imzalanmalı — eski imza yeni metni bağlamaz
    patch.imzaliPdfUrl = null
    patch.imzaliPdfAd = null
    patch.imzaTarihi = null
    patch.gonderimTarihi = null
  }

  const g = await satisSozlesmeGuncelle(id, patch)
  if (g?._hata) return g
  if (sozlesme.durum === 'imzalandi') {
    bildirimGonder(sozlesme.hazirlayanId, 'İmzalı sözleşme revizyona açıldı',
      `${sozlesme.sozlesmeNo} (Rev. ${patch.revizyonNo}) — ${kullanici?.ad || 'yönetici'} kilidi açtı. ` +
      `Önceki imzalı sürüm arşivlendi; değişiklik sonrası YENİDEN İMZA gerekiyor.` +
      (sebep ? ` Sebep: ${sebep}` : ''))
  }
  return g
}

/** Arşivlenmiş imzalı sürümler (revizyon geçmişi). */
export const imzaGecmisiGetir = (sozlesme) =>
  (Array.isArray(sozlesme?.imzaGecmisi) ? sozlesme.imzaGecmisi : [])
    .slice()
    .sort((a, b) => (b.revizyon || 0) - (a.revizyon || 0))

// ---------- Dosyalar (satis-sozlesme bucket) ----------

export const ssDosyaYukle = async (sozlesmeId, file, prefix) => {
  const uzanti = (file.name.split('.').pop() || 'pdf').toLowerCase()
  const path = `${sozlesmeId}/${prefix}-${Date.now()}.${uzanti}`
  const { error } = await supabase.storage.from('satis-sozlesme').upload(path, file)
  if (error) { console.error('ssDosyaYukle hata:', error.message); return null }
  return path
}

export const ssDosyaUrl = async (path) => {
  const { data, error } = await supabase.storage.from('satis-sozlesme').createSignedUrl(path, 3600)
  if (error) { console.error('ssDosyaUrl hata:', error.message); return null }
  return data?.signedUrl || null
}

// İmzalı sözleşme (PDF zorunlu) → durum imzalandi + bağlı sipariş "Sözleşmeli Sipariş"
export const imzaliSozlesmeYukleSS = async ({ sozlesme, file }) => {
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
    return { _hata: 'İmzalı sözleşme yalnızca PDF olarak yüklenebilir.' }
  }
  const path = await ssDosyaYukle(sozlesme.id, file, 'imzali')
  if (!path) return { _hata: 'Dosya yüklenemedi.' }
  const g = await satisSozlesmeGuncelle(sozlesme.id, {
    imzaliPdfUrl: path, imzaliPdfAd: file.name,
    durum: 'imzalandi', imzaTarihi: new Date().toISOString(),
    kurFarkiDurumu: sozlesme.kurFarkiUygulanir && sozlesme.kurFarkiDurumu === 'yok' ? 'izleniyor' : sozlesme.kurFarkiDurumu,
  })
  if (g?._hata) return g
  if (sozlesme.siparisId) {
    await supabase.from('siparisler').update({ sozlesme_id: sozlesme.id }).eq('id', sozlesme.siparisId)
  }
  return g
}

// ---------- Kur farkı takibi (spec §10) ----------

export const kurFarkiKaydet = async (id, { tahsilKuru, kurFarkiTl, durum }) =>
  satisSozlesmeGuncelle(id, { tahsilKuru, kurFarkiTl, kurFarkiDurumu: durum })

// ---------- Kaynaktan veri hazırlama ----------

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

// Firma tipini unvandan tahmin et — kullanıcı yine de değiştirebilir
export const firmaTipiTahmin = (firmaAdi) => {
  const s = (firmaAdi || '').toLocaleLowerCase('tr')
  if (/a\.?\s?ş\.?|anonim/.test(s)) return 'anonim'
  if (/ltd|limited|şti/.test(s)) return 'limited'
  if (/belediye|bakanlık|müdürlüğ|kaymakam|valilik|üniversite/.test(s)) return 'kamu'
  if (/vakf|vakıf/.test(s)) return 'vakif'
  if (/derneğ|dernek/.test(s)) return 'dernek'
  return null
}

// Müşteri kartındaki firma künyesi (vergi no, vergi dairesi, adres, iletişim).
// Teklif/sipariş kaydı bunları tutmuyor — sözleşmede elle doldurulmasın diye
// müşteriden taşınır. Boş alanlar mevcut form değerini EZMEZ.
export const musteridenKunye = (musteri) => {
  if (!musteri) return {}
  const dolu = (v) => (typeof v === 'string' ? v.trim() : v) || null
  const adres = [dolu(musteri.adres), dolu(musteri.sehir)].filter(Boolean).join(' · ')
  const kunye = {
    tcVergiNo:    dolu(musteri.vergiNo),
    vergiDairesi: dolu(musteri.vergiDairesi),
    adres:        adres || null,
    telefon:      dolu(musteri.telefon),
    email:        dolu(musteri.email),
    firmaAdi:     dolu(musteri.firma),
    yetkiliAdi:   [musteri.ad, musteri.soyad].filter(Boolean).join(' ').trim() || null,
    firmaTipi:    firmaTipiTahmin(musteri.firma),
  }
  // null olanları at — spread edilirken dolu alanları silmesin
  return Object.fromEntries(Object.entries(kunye).filter(([, v]) => v !== null))
}

// Ana toplam güvenli çözüm: genel_toplam boş/0/NaN ise ürün listesinden türet.
// Neden: 62 teklifte genel_toplam 0/null; ayrıca r2(undefined) = NaN olur ve
// number input'a NaN verilince alan BOŞ görünür (0 bile yazmaz) — kullanıcı
// "tutar otomatik gelmedi" diye görür. Tek satır bile olsa toplam elde var.
const urunListesiToplami = (liste) =>
  r2((liste || []).reduce((a, u) => a + (Number(u.toplam) || 0), 0))

const anaToplamCoz = (ham, urunListesi) => {
  const n = Number(ham)
  if (Number.isFinite(n) && n > 0) return r2(n)
  return urunListesiToplami(urunListesi)
}

// Teklif → sözleşme form alanları (genel_toplam KDV DAHİLDİR — TeklifDetay hesabı)
export const tekliftenForm = (teklif, gorusmeNo) => {
  const urunListesi = (teklif.satirlar || []).map(s => ({
    stokKodu: s.stokKodu || '',
    urunAdi: s.stokAdi || s.aciklama || '',
    miktar: Number(s.miktar) || 0,
    birim: s.birim || 'Adet',
    birimFiyat: Number(s.birimFiyat) || 0,
    toplam: r2((Number(s.miktar) || 0) * (Number(s.birimFiyat) || 0) * (1 - (Number(s.iskonto) || 0) / 100) * (1 + (Number(s.kdv) || 0) / 100)),
  }))
  return {
    musteriId: teklif.musteriId || null,
    teklifId: teklif.id, teklifNo: teklif.teklifNo || '',
    gorusmeNo: gorusmeNo || '',
    firmaAdi: teklif.firmaAdi || '',
    yetkiliAdi: teklif.musteriYetkilisi || '',
    isinKonusu: teklif.konu || '',
    paraBirimi: ['TL', 'USD', 'EUR'].includes(teklif.paraBirimi) ? teklif.paraBirimi : 'TL',
    anaToplam: anaToplamCoz(teklif.genelToplam, urunListesi),
    urunListesi,
  }
}

// Sipariş → sözleşme form alanları
// `siparis.lokasyonAd` verilirse sözleşmenin Lokasyon alanına düşer (mig 286);
// sözleşme metni bu satırı zaten basıyordu, kaynak eksikti.
export const siparistenForm = (siparis, kalemler, musteri) => {
  const urunListesi = (kalemler || []).map(k => ({
    stokKodu: k.stokKodu || '',
    urunAdi: k.urunAd || k.aciklama || '',
    miktar: Number(k.miktar) || 0,
    birim: k.birim || 'Adet',
    birimFiyat: Number(k.birimFiyat) || 0,
    toplam: r2((Number(k.araToplam) || 0) * (1 + (Number(k.kdvOrani) || 0) / 100)),
  }))
  return {
    musteriId: siparis.musteriId || null,
    // siparisNo forma taşınmaz — alan kaldırıldı; siparisId bağlantı için kalıyor
    siparisId: siparis.id,
    teklifId: siparis.teklifId || null,
    firmaAdi: musteri?.firma || '',
    yetkiliAdi: [musteri?.ad, musteri?.soyad].filter(Boolean).join(' '),
    telefon: musteri?.telefon || '', email: musteri?.email || '',
    isinKonusu: siparis.konu || '',
    lokasyon: siparis.lokasyonAd || '',
    paraBirimi: ['TL', 'USD', 'EUR'].includes(siparis.paraBirimi) ? siparis.paraBirimi : 'TL',
    anaToplam: anaToplamCoz(siparis.genelToplam, urunListesi),
    urunListesi,
  }
}

// ---------- Bildirim (best-effort) ----------

const bildirimGonder = async (aliciId, baslik, mesaj) => {
  try {
    const { data: adminler } = await supabase.from('kullanicilar').select('id').eq('rol', 'admin')
    const alicilar = new Set((adminler || []).map(a => a.id))
    if (aliciId) alicilar.add(Number(aliciId))
    if (!alicilar.size) return
    await cokluBildirimEkle([...alicilar], { baslik, mesaj, tip: 'bilgi', link: '/sozlesmeler' })
  } catch (e) {
    console.error('ss bildirim hata:', e?.message)
  }
}
