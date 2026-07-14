// Servis malzemeleri (mig 153) — serviste kullanılan ürünlerin kaydı.
// Spec: "Kullanılan ürün otomatik olarak teknisyen deposundan düşmelidir."
// SN'li üründe teknisyendeki kalem seçilir → durum='sahada' (düşüm) + çıkış
// hareketi; silinirse geri alınır (durum='teknisyende' + giriş hareketi).
import { supabase } from '../lib/supabase'
import { arrayToCamel, toCamel } from '../lib/mapper'
import { invalidatePrefix } from '../lib/cache'

const oturumKullanici = async () => {
  const { data: sess } = await supabase.auth.getUser()
  if (!sess?.user?.id) return { id: null, ad: null }
  const { data: kul } = await supabase.from('kullanicilar')
    .select('id, ad').eq('auth_id', sess.user.id).maybeSingle()
  return { id: kul?.id || null, ad: kul?.ad || null }
}

const hareketYaz = async ({ stokKodu, stokAdi, tip, aciklama, kullaniciId }) => {
  await supabase.from('stok_hareketleri').insert({
    stok_kodu: stokKodu,
    stok_adi: stokAdi || null,
    hareket_tipi: tip,
    miktar: 1,
    aciklama,
    tarih: new Date().toISOString(),
    kullanici_id: kullaniciId,
  })
}

export const servisMalzemeleriGetir = async (servisId) => {
  const { data, error } = await supabase
    .from('servis_malzemeleri')
    .select('*')
    .eq('servis_id', servisId)
    .order('tarih', { ascending: false })
  if (error) { console.error('[servisMalzemeleriGetir]', error.message); return [] }
  return arrayToCamel(data) ?? []
}

// Ürünün teknisyende olan aktif SN kalemleri (düşüm için seçilebilir liste)
export const teknisyendekiKalemler = async (stokKodu) => {
  const { data, error } = await supabase
    .from('stok_kalemleri')
    .select('id, seri_no, teknisyen_id, model, teknisyen:teknisyen_id (ad)')
    .eq('stok_kodu', stokKodu)
    .eq('durum', 'teknisyende')
    .eq('silindi', false)
    .order('seri_no')
  if (error) { console.error('[teknisyendekiKalemler]', error.message); return [] }
  return arrayToCamel(data) ?? []
}

/**
 * Malzeme ekle. kalem verilirse (SN'li) o kalem 'sahada' yapılır ve çıkış
 * hareketi yazılır; kalem yoksa yalnız kayıt + çıkış hareketi (miktarlı).
 */
export const servisMalzemeEkle = async ({ servisId, servisKodu, urun, miktar = 1, kalem = null }) => {
  const kul = await oturumKullanici()

  if (kalem) {
    // SN düşümü — teknisyen deposundan sahaya
    const { error: kErr } = await supabase
      .from('stok_kalemleri')
      .update({ durum: 'sahada' })
      .eq('id', kalem.id)
      .eq('durum', 'teknisyende')  // yarış koşulu: hâlâ teknisyendeyse düş
    if (kErr) throw new Error('SN düşümü yapılamadı: ' + kErr.message)
  }

  const { data, error } = await supabase
    .from('servis_malzemeleri')
    .insert({
      servis_id: servisId,
      stok_kodu: urun.stokKodu || null,
      urun_adi: urun.stokAdi || urun.urunAdi,
      miktar: Number(miktar) || 1,
      birim: urun.birim || 'Adet',
      seri_no: kalem?.seriNo || null,
      kalem_id: kalem?.id || null,
      kullanici_id: kul.id,
      kullanici_ad: kul.ad,
    })
    .select()
    .single()
  if (error) {
    // Malzeme kaydı başarısızsa SN düşümünü geri al (tutarlılık)
    if (kalem) {
      await supabase.from('stok_kalemleri').update({ durum: 'teknisyende' }).eq('id', kalem.id)
    }
    throw new Error('Malzeme kaydedilemedi: ' + error.message)
  }

  if (urun.stokKodu) {
    await hareketYaz({
      stokKodu: urun.stokKodu,
      stokAdi: urun.stokAdi || urun.urunAdi,
      tip: 'cikis',
      aciklama: kalem
        ? `Serviste kullanıldı: ${kalem.seriNo} — ${servisKodu || 'servis #' + servisId}`
        : `Serviste kullanıldı (${miktar} ${urun.birim || 'Adet'}) — ${servisKodu || 'servis #' + servisId}`,
      kullaniciId: kul.id,
    })
  }
  invalidatePrefix('stok')
  return toCamel(data)
}

// Malzeme kaydını sil + SN'li ise düşümü geri al
export const servisMalzemeSil = async (malzeme, servisKodu) => {
  const kul = await oturumKullanici()
  const { error } = await supabase.from('servis_malzemeleri').delete().eq('id', malzeme.id)
  if (error) throw new Error('Silinemedi: ' + error.message)

  if (malzeme.kalemId) {
    await supabase.from('stok_kalemleri')
      .update({ durum: 'teknisyende' })
      .eq('id', malzeme.kalemId)
      .eq('durum', 'sahada')  // yalnız hâlâ sahadaysa geri al
  }
  if (malzeme.stokKodu) {
    await hareketYaz({
      stokKodu: malzeme.stokKodu,
      stokAdi: malzeme.urunAdi,
      tip: 'giris',
      aciklama: malzeme.seriNo
        ? `Servis kullanımı geri alındı: ${malzeme.seriNo} — ${servisKodu || 'servis #' + malzeme.servisId}`
        : `Servis kullanımı geri alındı (${malzeme.miktar} ${malzeme.birim || 'Adet'}) — ${servisKodu || 'servis #' + malzeme.servisId}`,
      kullaniciId: kul.id,
    })
  }
  invalidatePrefix('stok')
}
