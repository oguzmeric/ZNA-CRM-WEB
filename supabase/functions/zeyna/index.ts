// Zeyna — ZNA Teknoloji'nin AI iş asistanı.
//
// Akış (agentic loop):
//   1. Kullanıcı mesajı geldi
//   2. Claude'a system prompt + history + tools listesi gönder
//   3. Claude tool_use isterse: tool'u çalıştır, sonucu Claude'a geri ver, 2'ye dön
//   4. Claude text döndüğünde: yanıtı DB'ye kaydet ve kullanıcıya gönder
//
// Required secrets:
//   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
//   - ANTHROPIC_API_KEY

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

const MODEL = 'claude-sonnet-4-6'
const MAX_HISTORY = 20
const MAX_TOOL_LOOPS = 6   // agentic loop güvenlik (kötü tool çağrısı sonsuz dönmesin)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  // supabase-js yeni surumler x-supabase-api-version, x-supabase-auth-token gibi
  // header'lar da yolluyor — '*' veya genis liste kullanmak lazim
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version, x-supabase-auth-token, accept, accept-language',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

const supa = createClient(SUPABASE_URL, SERVICE_ROLE)

// ─── Zeyna karakter sistemi ────────────────────────────────────────────────
const SYSTEM_PROMPT = `Sen Zeyna'sın — ZNA Teknoloji'nin AI iş asistanısın.

KİMLİK:
- İsim: Zeyna
- Şirket: ZNA Teknoloji (güvenlik kameraları, Trassir, Karel, ses/PA sistemleri B2B servis sağlayıcısı)
- Rolün: Personel için ofis asistanı — sorgular, özetler, hatırlatmalar, hızlı bilgi

KİŞİLİK:
- Profesyonel ama sıcak — samimi ol
- Net ve kısa — gereksiz uzatma
- Türkçe yanıt ver, İngilizce teknik terimler (Trassir, RAID) olduğu gibi kalabilir
- Emin değilsen "Bilmiyorum, kontrol edeyim" de — uydurma
- Personelle "sen" diliyle konuş, ama saygılı

YAPABILECEKLERIN:
- Genel sohbet, yazım yardımı, brainstorm, kontrol listesi
- CRM sorgularını TOOL'larla yap — şu kategorilerde:
  * Müşteri & Personel arama (musteri_ara, kullanici_ara)
  * Talepler (musteri_talepleri, bekleyen_servislerim)
  * Teklifler (teklifler_ara)
  * Görüşmeler & Ziyaretler (gorusme_ara)
  * Müşteri 360 derece özet (musteri_360 — talep+teklif+görüşme+satış sayıları + son aktiviteler)
  * Görevler (gorev_ara, bekleyen_gorevlerim)
  * Satış & Faturalar (satislar_ara)
  * Kargolar (kargo_ara)
  * Trassir Lisanslar (trassir_lisans_ara — yaklasan_gun parametresi yenileme yaklaşanlar için)
  * İstatistikler (istatistik tool, tip parametresi: en_cok_ziyaret_edilen_musteri, en_cok_talep_olan_musteri, en_aktif_personel, bu_ay_satis_toplami, acik_talep_durumu, yaklasan_lisanslar)
- Sıralı, isimle, ID gerektiren sorularda önce arama yap (musteri_ara/kullanici_ara), sonra ana sorguyu
- Kullanıcı bir müşteri hakkında özet isterse: önce musteri_ara, sonra musteri_360
- Sonuçları Türkçe **liste** olarak özetle (gerek yoksa tablo kurma)
- Para birimi varsa "₺ 25.000,00" formatı kullan
- Tarih formatı: 25/06/2026

KURALLAR:
- Müşterinin telefonu/maili gibi PII'yi gereksiz yere açıkça yazma
- Şüpheli sorularda (admin şifresi, başkasının verisi vs) reddet
- Hata olursa kullanıcıya açıkla, sessizce yutma`

// ─── Tools — Claude'a verilecek fonksiyon tanımları ───────────────────────
const TOOLS = [
  {
    name: 'musteri_ara',
    description:
      'Müşteri (firma veya kişi) ara. Kullanıcı bir müşteri ismi söylediğinde önce bunu çağır, döndürülen müşteri_id\'leri sonraki sorguda kullan. Fuzzy arama yapar (büyük/küçük harf, kısmi eşleşme).',
    input_schema: {
      type: 'object',
      properties: {
        arama: { type: 'string', description: 'Aranacak metin — firma, ad, soyad veya bunların parçaları' },
        limit: { type: 'number', description: 'Maks sonuç sayısı (varsayılan 10)' },
      },
      required: ['arama'],
    },
  },
  {
    name: 'kullanici_ara',
    description: 'Personel (kullanıcı) ara — ad veya soyada göre. "Ferdi\'nin görevleri" gibi sorularda önce bunu çağır.',
    input_schema: {
      type: 'object',
      properties: {
        arama: { type: 'string', description: 'Personel adı/soyadı' },
        limit: { type: 'number', description: 'Maks sonuç (varsayılan 10)' },
      },
      required: ['arama'],
    },
  },
  {
    name: 'musteri_talepleri',
    description: 'Bir müşterinin servis taleplerini getir. musteri_id\'yi musteri_ara\'dan al.',
    input_schema: {
      type: 'object',
      properties: {
        musteri_id: { type: 'number', description: 'Müşteri ID (musteri_ara\'dan)' },
        durum: {
          type: 'string',
          description: "Durum filtresi — 'acik' (tamamlanmamış olanlar), 'tamamlandi', veya boş bırak (tümü)",
        },
        limit: { type: 'number', description: 'Maks sonuç (varsayılan 20)' },
      },
      required: ['musteri_id'],
    },
  },
  {
    name: 'teklifler_ara',
    description:
      'Teklifleri ara. Firma adı, durum, tarih aralığı ile filtrelenebilir. Hiç filtre verilmezse en son 10 teklif döner.',
    input_schema: {
      type: 'object',
      properties: {
        firma: { type: 'string', description: 'Firma adı (kısmi eşleşme)' },
        durum: { type: 'string', description: 'kabul / takipte / revizyon / vazgecildi' },
        tarih_baslangic: { type: 'string', description: 'YYYY-MM-DD' },
        tarih_bitis:     { type: 'string', description: 'YYYY-MM-DD' },
        limit: { type: 'number', description: 'Maks sonuç (varsayılan 10)' },
      },
    },
  },
  {
    name: 'bekleyen_servislerim',
    description:
      'Çağıran personele atanmış açık servis talepleri (tamamlanmamış). "Bana atanmış işler" / "yapmam gerekenler" gibi sorularda kullan.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Maks sonuç (varsayılan 20)' },
      },
    },
  },
  {
    name: 'gorusme_ara',
    description:
      'Müşteri görüşmelerini/ziyaretlerini ara. "Talay\'ı kim son ziyaret etmiş", "Bu hafta Ferdi kimleri ziyaret etmiş", "Bu ayki online görüşmeler" gibi sorular için.',
    input_schema: {
      type: 'object',
      properties: {
        musteri_id: { type: 'number', description: 'Belirli müşteri için (musteri_ara\'dan)' },
        firma: { type: 'string', description: 'Firma adı (kısmi eşleşme)' },
        olusturan_id: { type: 'number', description: 'Görüşmeyi yapan personel ID (kullanici_ara\'dan)' },
        tip: { type: 'string', description: 'Görüşme tipi — ziyaret, telefon, online, vs.' },
        irtibat_sekli: { type: 'string', description: 'İrtibat şekli filtresi' },
        tarih_baslangic: { type: 'string', description: 'YYYY-MM-DD' },
        tarih_bitis: { type: 'string', description: 'YYYY-MM-DD' },
        limit: { type: 'number', description: 'Varsayılan 10' },
      },
    },
  },
  {
    name: 'musteri_360',
    description:
      'Bir müşterinin 360 derece özeti — toplam talep/teklif/görüşme/satış sayıları, son aktivite tarihi, açık talepler. "Talay Lojistik hakkında özet ver" gibi sorular için.',
    input_schema: {
      type: 'object',
      properties: {
        musteri_id: { type: 'number', description: 'musteri_ara\'dan gelen ID' },
      },
      required: ['musteri_id'],
    },
  },
  {
    name: 'gorev_ara',
    description:
      'Görevleri ara — kim, durum, tarih filtresiyle. "Ferdi\'nin açık görevleri", "Bu hafta tamamlanan görevler" gibi sorular için.',
    input_schema: {
      type: 'object',
      properties: {
        atanan_id: { type: 'number', description: 'Atanmış personel ID (kullanici_ara\'dan)' },
        durum: { type: 'string', description: 'beklemede / devam_ediyor / tamamlandi / iptal' },
        musteri_id: { type: 'number', description: 'İlgili müşteri ID' },
        oncelik: { type: 'string', description: 'dusuk / orta / yuksek / acil' },
        tarih_baslangic: { type: 'string', description: 'YYYY-MM-DD' },
        tarih_bitis: { type: 'string', description: 'YYYY-MM-DD' },
        limit: { type: 'number', description: 'Varsayılan 15' },
      },
    },
  },
  {
    name: 'bekleyen_gorevlerim',
    description: 'Çağıran personele atanmış açık görevler. "Yapmam gereken görevler" gibi sorularda kullan.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Varsayılan 20' },
      },
    },
  },
  {
    name: 'satislar_ara',
    description:
      'Satış faturalarını ara. "Talay\'a kesilen son fatura", "Bu ayki toplam satış", "Bekleyen tahsilatlar" gibi sorular için.',
    input_schema: {
      type: 'object',
      properties: {
        firma: { type: 'string', description: 'Firma adı kısmi eşleşme' },
        durum: { type: 'string', description: 'odendi / bekliyor / kismi / iptal' },
        tarih_baslangic: { type: 'string', description: 'YYYY-MM-DD (fatura_tarihi)' },
        tarih_bitis: { type: 'string', description: 'YYYY-MM-DD' },
        limit: { type: 'number', description: 'Varsayılan 15' },
      },
    },
  },
  {
    name: 'kargo_ara',
    description:
      'Kargo gönderilerini ara. "Bekleyen kargolar", "Talay\'a giden kargolar", takip no ile sorgu için.',
    input_schema: {
      type: 'object',
      properties: {
        takip_no: { type: 'string', description: 'Kargo takip numarası' },
        firma: { type: 'string', description: 'Firma adı kısmi eşleşme' },
        durum: { type: 'string', description: 'hazirlandi / yolda / teslim_edildi / iade' },
        tip: { type: 'string', description: 'Kargo tipi' },
        limit: { type: 'number', description: 'Varsayılan 15' },
      },
    },
  },
  {
    name: 'trassir_lisans_ara',
    description:
      'Trassir lisanslarını ara. "Yaklaşan lisans yenilemeleri", "Talay\'ın Trassir lisansları", "Süresi geçmiş lisanslar" gibi sorular için.',
    input_schema: {
      type: 'object',
      properties: {
        musteri_id: { type: 'number', description: 'Müşteri ID' },
        firma: { type: 'string', description: 'Firma adı kısmi eşleşme' },
        yaklasan_gun: {
          type: 'number',
          description: 'Bitiş tarihi şu kadar gün içindeyse listele (örn 30 = önümüzdeki 30 gün)',
        },
        durum: { type: 'string', description: 'aktif / pasif / iptal' },
        limit: { type: 'number', description: 'Varsayılan 20' },
      },
    },
  },
  {
    name: 'istatistik',
    description:
      'Toplulaştırılmış sorular için — "en çok ziyaret edilen 5 müşteri", "bu ay en çok talep oluşan firma", "en aktif teknisyen" gibi sıralamalar. "tip" parametresi ile farklı sıralamalar yapılır.',
    input_schema: {
      type: 'object',
      properties: {
        tip: {
          type: 'string',
          description:
            'Hangi istatistik — "en_cok_ziyaret_edilen_musteri" | "en_cok_talep_olan_musteri" | "en_aktif_personel" | "bu_ay_satis_toplami" | "acik_talep_durumu" | "yaklasan_lisanslar"',
        },
        tarih_baslangic: { type: 'string', description: 'YYYY-MM-DD opsiyonel' },
        tarih_bitis: { type: 'string', description: 'YYYY-MM-DD opsiyonel' },
        limit: { type: 'number', description: 'En üstte N kayıt (varsayılan 5)' },
      },
      required: ['tip'],
    },
  },
]

// ─── Tool execution — DB sorguları ───────────────────────────────────────

interface ToolContext { kullaniciId: number; kullaniciAd: string; rolAdmin: boolean }

async function toolCalistir(
  ad: string,
  girdi: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  switch (ad) {
    case 'musteri_ara': {
      const q = String(girdi.arama ?? '').trim()
      const limit = Number(girdi.limit ?? 10)
      if (!q) return { hata: 'Arama metni boş' }
      const { data, error } = await supa
        .from('musteriler')
        .select('id, firma, ad, soyad, telefon, email, sehir')
        .or(`firma.ilike.%${q}%,ad.ilike.%${q}%,soyad.ilike.%${q}%`)
        .limit(limit)
      if (error) return { hata: error.message }
      return { sonuc_sayisi: data?.length ?? 0, musteriler: data ?? [] }
    }

    case 'kullanici_ara': {
      const q = String(girdi.arama ?? '').trim()
      const limit = Number(girdi.limit ?? 10)
      if (!q) return { hata: 'Arama metni boş' }
      // NOT: kullanicilar tablosunda 'soyad' kolonu yok — ad alani 'Ad Soyad'
      // formatinda bos ayrik. kullanici_adi de aranabilir.
      const { data, error } = await supa
        .from('kullanicilar')
        .select('id, ad, kullanici_adi, tip, durum, email, unvan')
        .neq('tip', 'musteri')
        .or(`ad.ilike.%${q}%,kullanici_adi.ilike.%${q}%`)
        .limit(limit)
      if (error) return { hata: error.message }
      return { sonuc_sayisi: data?.length ?? 0, kullanicilar: data ?? [] }
    }

    case 'musteri_talepleri': {
      const musteriId = Number(girdi.musteri_id)
      const durum = String(girdi.durum ?? '').toLowerCase()
      const limit = Number(girdi.limit ?? 20)
      if (!musteriId) return { hata: 'musteri_id gerekli' }
      let q = supa
        .from('servis_talepleri')
        .select('id, talep_no, konu, durum, aciliyet, ana_tur, atanan_kullanici_ad, olusturma_tarihi, planli_tarih')
        .eq('musteri_id', musteriId)
        .order('olusturma_tarihi', { ascending: false })
        .limit(limit)
      if (durum === 'acik') {
        q = q.not('durum', 'in', '("tamamlandi","iptal")')
      } else if (durum) {
        q = q.eq('durum', durum)
      }
      const { data, error } = await q
      if (error) return { hata: error.message }
      return { sonuc_sayisi: data?.length ?? 0, talepler: data ?? [] }
    }

    case 'teklifler_ara': {
      const firma = String(girdi.firma ?? '').trim()
      const durum = String(girdi.durum ?? '').trim()
      const limit = Number(girdi.limit ?? 10)
      const tarihBas = girdi.tarih_baslangic
      const tarihBit = girdi.tarih_bitis
      let q = supa
        .from('teklifler')
        .select('id, teklif_no, firma_adi, musteri_yetkilisi, konu, durum, para_birimi, genel_toplam, tarih, olusturma_tarih')
        .order('olusturma_tarih', { ascending: false })
        .limit(limit)
      if (firma) q = q.ilike('firma_adi', `%${firma}%`)
      if (durum) q = q.eq('durum', durum)
      if (tarihBas) q = q.gte('tarih', String(tarihBas))
      if (tarihBit) q = q.lte('tarih', String(tarihBit))
      const { data, error } = await q
      if (error) return { hata: error.message }
      return { sonuc_sayisi: data?.length ?? 0, teklifler: data ?? [] }
    }

    case 'bekleyen_servislerim': {
      const limit = Number(girdi.limit ?? 20)
      const { data, error } = await supa
        .from('servis_talepleri')
        .select('id, talep_no, firma_adi, musteri_ad, konu, durum, aciliyet, olusturma_tarihi, planli_tarih')
        .eq('atanan_kullanici_id', ctx.kullaniciId)
        .not('durum', 'in', '("tamamlandi","iptal")')
        .order('olusturma_tarihi', { ascending: false })
        .limit(limit)
      if (error) return { hata: error.message }
      return { sonuc_sayisi: data?.length ?? 0, talepler: data ?? [] }
    }

    case 'gorusme_ara': {
      const limit = Number(girdi.limit ?? 10)
      let q = supa
        .from('gorusmeler')
        .select('id, akt_no, tarih, saat, firma_adi, musteri_adi, konu, tip, durum, gorusen, olusturan_id, irtibat_sekli')
        .order('tarih', { ascending: false })
        .limit(limit)
      // "Sadece yönetici" işaretli görüşmeler (mig 188) — service role RLS'i
      // bypass ettiği için burada elle süzülür; admin olmayan göremez
      if (!ctx.rolAdmin) q = q.eq('yalniz_yonetici', false)
      if (girdi.musteri_id) q = q.eq('musteri_id', Number(girdi.musteri_id))
      if (girdi.firma) q = q.ilike('firma_adi', `%${girdi.firma}%`)
      if (girdi.olusturan_id) q = q.eq('olusturan_id', Number(girdi.olusturan_id))
      if (girdi.tip) q = q.ilike('tip', `%${girdi.tip}%`)
      if (girdi.irtibat_sekli) q = q.ilike('irtibat_sekli', `%${girdi.irtibat_sekli}%`)
      if (girdi.tarih_baslangic) q = q.gte('tarih', String(girdi.tarih_baslangic))
      if (girdi.tarih_bitis) q = q.lte('tarih', String(girdi.tarih_bitis))
      const { data, error } = await q
      if (error) return { hata: error.message }
      return { sonuc_sayisi: data?.length ?? 0, gorusmeler: data ?? [] }
    }

    case 'musteri_360': {
      const mid = Number(girdi.musteri_id)
      if (!mid) return { hata: 'musteri_id gerekli' }
      const [mst, tlp, tkf, grs, sts, trs] = await Promise.all([
        supa.from('musteriler').select('id, firma, ad, soyad, sehir, telefon, email, sektor').eq('id', mid).maybeSingle(),
        supa.from('servis_talepleri').select('id, talep_no, konu, durum, olusturma_tarihi', { count: 'exact' }).eq('musteri_id', mid).order('olusturma_tarihi', { ascending: false }).limit(5),
        supa.from('teklifler').select('id, teklif_no, konu, durum, genel_toplam, para_birimi, tarih', { count: 'exact' }).eq('musteri_id', mid).order('tarih', { ascending: false }).limit(5),
        (() => {
          let g = supa.from('gorusmeler').select('id, akt_no, tarih, konu, tip, gorusen', { count: 'exact' }).eq('musteri_id', mid)
          if (!ctx.rolAdmin) g = g.eq('yalniz_yonetici', false)  // mig 188 gizlilik
          return g.order('tarih', { ascending: false }).limit(5)
        })(),
        supa.from('satislar').select('id, fatura_no, fatura_tarihi, genel_toplam, durum, para_birimi', { count: 'exact' }).ilike('firma_adi', '%').order('fatura_tarihi', { ascending: false }).limit(5),
        supa.from('trassir_lisanslar').select('id, lisans_no, lisans_turu, bitis_tarihi, durum, kamera_sayisi').eq('musteri_id', mid),
      ])
      if (mst.error || !mst.data) return { hata: 'Müşteri bulunamadı' }
      return {
        musteri: mst.data,
        ozet: {
          toplam_talep:    tlp.count ?? 0,
          toplam_teklif:   tkf.count ?? 0,
          toplam_gorusme:  grs.count ?? 0,
          toplam_satis:    sts.count ?? 0,
          trassir_lisans:  trs.data?.length ?? 0,
        },
        son_talepler:   tlp.data ?? [],
        son_teklifler:  tkf.data ?? [],
        son_gorusmeler: grs.data ?? [],
        son_satislar:   sts.data ?? [],
        trassir_lisanslari: trs.data ?? [],
      }
    }

    case 'gorev_ara': {
      const limit = Number(girdi.limit ?? 15)
      let q = supa
        .from('gorevler')
        .select('id, baslik, durum, oncelik, atanan_id, atanan_ad, firma_adi, musteri_id, bitis_tarihi, tamamlanma_tarihi, olusturma_tarih')
        .order('olusturma_tarih', { ascending: false })
        .limit(limit)
      if (girdi.atanan_id) q = q.eq('atanan_id', Number(girdi.atanan_id))
      if (girdi.durum) q = q.eq('durum', String(girdi.durum))
      if (girdi.musteri_id) q = q.eq('musteri_id', Number(girdi.musteri_id))
      if (girdi.oncelik) q = q.eq('oncelik', String(girdi.oncelik))
      if (girdi.tarih_baslangic) q = q.gte('olusturma_tarih', String(girdi.tarih_baslangic))
      if (girdi.tarih_bitis) q = q.lte('olusturma_tarih', String(girdi.tarih_bitis))
      const { data, error } = await q
      if (error) return { hata: error.message }
      return { sonuc_sayisi: data?.length ?? 0, gorevler: data ?? [] }
    }

    case 'bekleyen_gorevlerim': {
      const limit = Number(girdi.limit ?? 20)
      const { data, error } = await supa
        .from('gorevler')
        .select('id, baslik, durum, oncelik, firma_adi, bitis_tarihi, olusturma_tarih')
        .eq('atanan_id', ctx.kullaniciId)
        .not('durum', 'in', '("tamamlandi","iptal")')
        .order('bitis_tarihi', { ascending: true, nullsFirst: false })
        .limit(limit)
      if (error) return { hata: error.message }
      return { sonuc_sayisi: data?.length ?? 0, gorevler: data ?? [] }
    }

    case 'satislar_ara': {
      const limit = Number(girdi.limit ?? 15)
      let q = supa
        .from('satislar')
        .select('id, fatura_no, firma_adi, fatura_tarihi, vade_tarihi, durum, para_birimi, genel_toplam, odenen_toplam')
        .order('fatura_tarihi', { ascending: false })
        .limit(limit)
      if (girdi.firma) q = q.ilike('firma_adi', `%${girdi.firma}%`)
      if (girdi.durum) q = q.eq('durum', String(girdi.durum))
      if (girdi.tarih_baslangic) q = q.gte('fatura_tarihi', String(girdi.tarih_baslangic))
      if (girdi.tarih_bitis) q = q.lte('fatura_tarihi', String(girdi.tarih_bitis))
      const { data, error } = await q
      if (error) return { hata: error.message }
      const toplam = (data ?? []).reduce((s, x) => s + Number(x.genel_toplam ?? 0), 0)
      return { sonuc_sayisi: data?.length ?? 0, toplam_tutar: toplam, satislar: data ?? [] }
    }

    case 'kargo_ara': {
      const limit = Number(girdi.limit ?? 15)
      let q = supa
        .from('kargolar')
        .select('id, takip_no, firma_adi, alici_ad, kargo_firmasi, durum, tip, tahmini_teslim, teslim_tarihi, olusturma_tarihi')
        .order('olusturma_tarihi', { ascending: false })
        .limit(limit)
      if (girdi.takip_no) q = q.ilike('takip_no', `%${girdi.takip_no}%`)
      if (girdi.firma) q = q.ilike('firma_adi', `%${girdi.firma}%`)
      if (girdi.durum) q = q.eq('durum', String(girdi.durum))
      if (girdi.tip) q = q.eq('tip', String(girdi.tip))
      const { data, error } = await q
      if (error) return { hata: error.message }
      return { sonuc_sayisi: data?.length ?? 0, kargolar: data ?? [] }
    }

    case 'trassir_lisans_ara': {
      const limit = Number(girdi.limit ?? 20)
      let q = supa
        .from('trassir_lisanslar')
        .select('id, firma_adi, musteri_id, lisans_no, lisans_turu, lisans_tipi, baslangic_tarihi, bitis_tarihi, durum, kamera_sayisi, sunucu_adi, lokasyon')
        .order('bitis_tarihi', { ascending: true, nullsFirst: false })
        .limit(limit)
      if (girdi.musteri_id) q = q.eq('musteri_id', Number(girdi.musteri_id))
      if (girdi.firma) q = q.ilike('firma_adi', `%${girdi.firma}%`)
      if (girdi.durum) q = q.eq('durum', String(girdi.durum))
      if (girdi.yaklasan_gun) {
        const bugun = new Date().toISOString().slice(0, 10)
        const ileri = new Date(Date.now() + Number(girdi.yaklasan_gun) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
        q = q.gte('bitis_tarihi', bugun).lte('bitis_tarihi', ileri)
      }
      const { data, error } = await q
      if (error) return { hata: error.message }
      return { sonuc_sayisi: data?.length ?? 0, lisanslar: data ?? [] }
    }

    case 'istatistik': {
      const tip = String(girdi.tip ?? '')
      const limit = Number(girdi.limit ?? 5)
      const baslangic = girdi.tarih_baslangic
      const bitis = girdi.tarih_bitis

      switch (tip) {
        case 'en_cok_ziyaret_edilen_musteri': {
          let q = supa.from('gorusmeler').select('musteri_id, firma_adi')
          if (!ctx.rolAdmin) q = q.eq('yalniz_yonetici', false)  // mig 188 gizlilik
          if (baslangic) q = q.gte('tarih', String(baslangic))
          if (bitis) q = q.lte('tarih', String(bitis))
          const { data, error } = await q.limit(10000)
          if (error) return { hata: error.message }
          const sayim: Record<string, { firma: string; adet: number; musteri_id: number | null }> = {}
          for (const r of (data ?? [])) {
            const k = String(r.musteri_id ?? r.firma_adi ?? '?')
            if (!sayim[k]) sayim[k] = { firma: r.firma_adi ?? '?', musteri_id: r.musteri_id, adet: 0 }
            sayim[k].adet++
          }
          const siralanmis = Object.values(sayim).sort((a, b) => b.adet - a.adet).slice(0, limit)
          return { tip, siralama: siralanmis, toplam_kayit: data?.length ?? 0 }
        }
        case 'en_cok_talep_olan_musteri': {
          let q = supa.from('servis_talepleri').select('musteri_id, firma_adi')
          if (baslangic) q = q.gte('olusturma_tarihi', String(baslangic))
          if (bitis) q = q.lte('olusturma_tarihi', String(bitis))
          const { data, error } = await q.limit(10000)
          if (error) return { hata: error.message }
          const sayim: Record<string, { firma: string; adet: number; musteri_id: number | null }> = {}
          for (const r of (data ?? [])) {
            const k = String(r.musteri_id ?? r.firma_adi ?? '?')
            if (!sayim[k]) sayim[k] = { firma: r.firma_adi ?? '?', musteri_id: r.musteri_id, adet: 0 }
            sayim[k].adet++
          }
          return { tip, siralama: Object.values(sayim).sort((a, b) => b.adet - a.adet).slice(0, limit) }
        }
        case 'en_aktif_personel': {
          let q = supa.from('gorusmeler').select('olusturan_id, gorusen')
          if (!ctx.rolAdmin) q = q.eq('yalniz_yonetici', false)  // mig 188 gizlilik
          if (baslangic) q = q.gte('tarih', String(baslangic))
          if (bitis) q = q.lte('tarih', String(bitis))
          const { data, error } = await q.limit(10000)
          if (error) return { hata: error.message }
          const sayim: Record<string, { ad: string; adet: number; id: number | null }> = {}
          for (const r of (data ?? [])) {
            const k = String(r.olusturan_id ?? r.gorusen ?? '?')
            if (!sayim[k]) sayim[k] = { ad: r.gorusen ?? '?', id: r.olusturan_id, adet: 0 }
            sayim[k].adet++
          }
          return { tip, siralama: Object.values(sayim).sort((a, b) => b.adet - a.adet).slice(0, limit) }
        }
        case 'bu_ay_satis_toplami': {
          const ay_baslangic = baslangic ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
          const ay_bitis = bitis ?? new Date().toISOString().slice(0, 10)
          const { data, error } = await supa
            .from('satislar')
            .select('genel_toplam, odenen_toplam, durum, para_birimi')
            .gte('fatura_tarihi', ay_baslangic)
            .lte('fatura_tarihi', ay_bitis)
          if (error) return { hata: error.message }
          const toplam = (data ?? []).reduce((s, x) => s + Number(x.genel_toplam ?? 0), 0)
          const odenen = (data ?? []).reduce((s, x) => s + Number(x.odenen_toplam ?? 0), 0)
          return {
            tip,
            tarih_araligi: { baslangic: ay_baslangic, bitis: ay_bitis },
            fatura_sayisi: data?.length ?? 0,
            toplam_tutar: toplam,
            tahsil_edilen: odenen,
            bekleyen: toplam - odenen,
          }
        }
        case 'acik_talep_durumu': {
          const { data, error } = await supa
            .from('servis_talepleri')
            .select('durum, aciliyet')
            .not('durum', 'in', '("tamamlandi","iptal")')
            .limit(10000)
          if (error) return { hata: error.message }
          const durumSayim: Record<string, number> = {}
          const acilSayim: Record<string, number> = {}
          for (const r of (data ?? [])) {
            durumSayim[r.durum ?? '?'] = (durumSayim[r.durum ?? '?'] ?? 0) + 1
            acilSayim[r.aciliyet ?? '?'] = (acilSayim[r.aciliyet ?? '?'] ?? 0) + 1
          }
          return { tip, toplam_acik: data?.length ?? 0, durum_dagilimi: durumSayim, aciliyet_dagilimi: acilSayim }
        }
        case 'yaklasan_lisanslar': {
          const bugun = new Date().toISOString().slice(0, 10)
          const ileri = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
          const { data, error } = await supa
            .from('trassir_lisanslar')
            .select('firma_adi, lisans_no, bitis_tarihi, kamera_sayisi, durum')
            .gte('bitis_tarihi', bugun)
            .lte('bitis_tarihi', ileri)
            .order('bitis_tarihi', { ascending: true })
            .limit(limit)
          if (error) return { hata: error.message }
          return { tip, gun_araligi: 60, yaklasan_lisanslar: data ?? [] }
        }
        default:
          return { hata: `Bilinmeyen istatistik tipi: ${tip}. Geçerli: en_cok_ziyaret_edilen_musteri, en_cok_talep_olan_musteri, en_aktif_personel, bu_ay_satis_toplami, acik_talep_durumu, yaklasan_lisanslar` }
      }
    }

    default:
      return { hata: `Bilinmeyen tool: ${ad}` }
  }
}

// ─── Yardımcılar ───────────────────────────────────────────────────────────

function err(status: number, hata: string) {
  return new Response(
    JSON.stringify({ ok: false, hata }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}

async function kullaniciCek(authHeader: string): Promise<(ToolContext & { kalanSoru: number }) | null> {
  try {
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: ures } = await userClient.auth.getUser()
    if (!ures?.user) return null
    const { data: krow } = await supa
      .from('kullanicilar')
      .select('id, ad, tip, rol, zeyna_kalan_soru')
      .eq('auth_id', ures.user.id)
      .maybeSingle()
    if (!krow || krow.tip === 'musteri') return null
    return {
      kullaniciId: krow.id,
      kullaniciAd: krow.ad,
      rolAdmin: krow.rol === 'admin',
      kalanSoru: Number(krow.zeyna_kalan_soru ?? 0),
    }
  } catch { return null }
}

// Soru hakkindan 1 dus, lifetime toplam +1
async function kotaDus(kullaniciId: number) {
  // Read-modify-write — race condition'da sorun yok, admin yenileyebilir
  const { data: row } = await supa
    .from('kullanicilar')
    .select('zeyna_kalan_soru, zeyna_toplam_soru')
    .eq('id', kullaniciId)
    .single()
  if (!row) return
  await supa
    .from('kullanicilar')
    .update({
      zeyna_kalan_soru: Math.max(0, Number(row.zeyna_kalan_soru ?? 0) - 1),
      zeyna_toplam_soru: Number(row.zeyna_toplam_soru ?? 0) + 1,
    })
    .eq('id', kullaniciId)
}

async function konusmaBulVeyaOlustur(kullaniciId: number, konusmaId?: number): Promise<number> {
  if (konusmaId) {
    const { data } = await supa
      .from('ai_konusmalar')
      .select('id')
      .eq('id', konusmaId)
      .eq('kullanici_id', kullaniciId)
      .maybeSingle()
    if (data) return data.id
  }
  const { data: yeni } = await supa
    .from('ai_konusmalar')
    .insert({ kullanici_id: kullaniciId })
    .select('id')
    .single()
  return yeni!.id
}

async function mesajKaydet(args: {
  konusmaId: number
  rol: 'user' | 'assistant' | 'tool'
  icerik: string
  toolKullanildi?: string | null
  toolInput?: unknown
  toolOutput?: unknown
  tokenInput?: number
  tokenOutput?: number
}) {
  await supa.from('ai_mesajlar').insert({
    konusma_id: args.konusmaId,
    rol: args.rol,
    icerik: args.icerik,
    tool_kullanildi: args.toolKullanildi ?? null,
    tool_input: args.toolInput ?? null,
    tool_output: args.toolOutput ?? null,
    token_input: args.tokenInput ?? 0,
    token_output: args.tokenOutput ?? 0,
  })
}

async function gecmisYukle(konusmaId: number): Promise<{ rol: string; icerik: string }[]> {
  const { data } = await supa
    .from('ai_mesajlar')
    .select('rol, icerik')
    .eq('konusma_id', konusmaId)
    .in('rol', ['user', 'assistant'])
    .order('id', { ascending: false })
    .limit(MAX_HISTORY)
  if (!data) return []
  return data.reverse().map(m => ({ rol: m.rol, icerik: m.icerik }))
}

// ─── Claude agentic loop ───────────────────────────────────────────────────

type AnthropicMessage = {
  role: 'user' | 'assistant'
  content: string | Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
    | { type: 'tool_result'; tool_use_id: string; content: string }
  >
}

async function claudeIste(
  messages: AnthropicMessage[],
  kullaniciAd: string,
): Promise<{
  content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>
  stop_reason: string
  usage: { input_tokens: number; output_tokens: number }
}> {
  if (!ANTHROPIC_KEY) {
    throw new Error('ANTHROPIC_API_KEY secret eksik. Supabase secrets\'a ekle.')
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT + `\n\nKullanıcı adı: ${kullaniciAd}`,
      tools: TOOLS,
      messages,
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(`Claude API (${res.status}): ${JSON.stringify(data).slice(0, 250)}`)
  }
  return data
}

async function agenticLoop(
  ilkMesajlar: AnthropicMessage[],
  ctx: ToolContext,
  konusmaId: number,
): Promise<{ yanit: string; tokenInput: number; tokenOutput: number }> {
  const messages = [...ilkMesajlar]
  let toplamIn = 0
  let toplamOut = 0

  for (let i = 0; i < MAX_TOOL_LOOPS; i++) {
    const sonuc = await claudeIste(messages, ctx.kullaniciAd)
    toplamIn += sonuc.usage?.input_tokens ?? 0
    toplamOut += sonuc.usage?.output_tokens ?? 0

    // stop_reason 'tool_use' ise tool çağrılarını işle ve devam et
    if (sonuc.stop_reason === 'tool_use') {
      // Assistant mesajını history'ye ekle
      messages.push({ role: 'assistant', content: sonuc.content as any })

      // Her tool_use için çalıştır
      const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = []
      for (const blok of sonuc.content) {
        if (blok.type !== 'tool_use') continue
        const toolAd = blok.name ?? ''
        const toolGirdi = blok.input ?? {}
        console.log(`[zeyna] tool: ${toolAd}`, toolGirdi)
        const ciktirsd = await toolCalistir(toolAd, toolGirdi as Record<string, unknown>, ctx)
        const ciktiStr = JSON.stringify(ciktirsd)

        // DB'ye tool çağrısını kaydet (görünürlük için)
        await mesajKaydet({
          konusmaId,
          rol: 'tool',
          icerik: `Tool çağrıldı: ${toolAd}`,
          toolKullanildi: toolAd,
          toolInput: toolGirdi,
          toolOutput: ciktirsd,
        })

        toolResults.push({
          type: 'tool_result',
          tool_use_id: blok.id ?? '',
          content: ciktiStr,
        })
      }

      // Tool sonuçlarını user mesajı olarak ekle
      messages.push({ role: 'user', content: toolResults })
      continue
    }

    // stop_reason 'end_turn' veya 'max_tokens' — text yanıtı al ve dön
    const textBlock = sonuc.content.find(b => b.type === 'text')
    const yanit = textBlock?.text ?? '(boş yanıt)'
    return { yanit, tokenInput: toplamIn, tokenOutput: toplamOut }
  }

  // Loop sınırına ulaşıldı
  return {
    yanit: 'Üzgünüm, sorunu çözmek için çok fazla adım gerekti. Daha spesifik sorabilir misin?',
    tokenInput: toplamIn,
    tokenOutput: toplamOut,
  }
}

// ─── Handler ───────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const ctx = await kullaniciCek(authHeader)
    if (!ctx) return err(401, 'Oturum gerekli (sadece personel).')

    // Kota kontrolu
    if (ctx.kalanSoru <= 0) {
      return new Response(
        JSON.stringify({
          ok: false,
          hata: 'Soru hakkın doldu. Lütfen yöneticinden daha fazla soru hakkı iste.',
          kota_bitti: true,
          kalan_soru: 0,
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const body = await req.json()
    const mesaj = (body?.mesaj ?? '').toString().trim()
    const konusmaIdRaw = body?.konusma_id
    const konusmaId = konusmaIdRaw ? Number(konusmaIdRaw) : undefined

    if (!mesaj) return err(400, 'Mesaj boş olamaz.')
    if (mesaj.length > 4000) return err(400, 'Mesaj çok uzun (max 4000 karakter).')

    // Konuşma bul/oluştur
    const cid = await konusmaBulVeyaOlustur(ctx.kullaniciId, konusmaId)

    // Kullanıcı mesajını kaydet
    await mesajKaydet({ konusmaId: cid, rol: 'user', icerik: mesaj })

    // Geçmişi yükle (kullanıcı + asistan mesajları — tool mesajları skip)
    const gecmis = await gecmisYukle(cid)

    // Claude'a gönderilecek messages — gecmis zaten yeni mesajı içeriyor
    const messages: AnthropicMessage[] = gecmis.map(m => ({
      role: m.rol as 'user' | 'assistant',
      content: m.icerik,
    }))

    // Agentic loop
    const { yanit, tokenInput, tokenOutput } = await agenticLoop(messages, ctx, cid)

    // Asistan yanıtını kaydet + kotadan dus
    await mesajKaydet({
      konusmaId: cid,
      rol: 'assistant',
      icerik: yanit,
      tokenInput,
      tokenOutput,
    })
    await kotaDus(ctx.kullaniciId)
    const yeniKalan = Math.max(0, ctx.kalanSoru - 1)

    return new Response(
      JSON.stringify({
        ok: true,
        konusma_id: cid,
        yanit,
        token_input: tokenInput,
        token_output: tokenOutput,
        kalan_soru: yeniKalan,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    console.error('[zeyna] hata:', e)
    return err(500, (e as Error)?.message ?? 'bilinmeyen hata')
  }
})
