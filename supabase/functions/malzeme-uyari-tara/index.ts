// Kullanılan Malzemeler — günlük fatura gecikme uyarısı (madde 23.11, F4).
// Hafta içi 09:15'te (cron, mig 194) çalışır: bekleyen kalemleri tarar,
// muhasebe (fatura_yetkilisi) + adminlere TEK ÖZET bildirim atar (kalem başına
// bildirim spam'i bilinçli olarak yok). Push, bildirimler trigger'ından gider.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const BEKLEYEN = [
  'fatura_bekliyor', 'faturaya_hazir', 'proforma_hazirlandi',
  'proforma_gonderildi', 'musteri_onayi_bekleniyor', 'kismen_faturalandi', 'fatura_iptal',
]
const PB_SEMBOL: Record<string, string> = { TL: '₺', USD: '$', EUR: '€' }

Deno.serve(async (req) => {
  try {
    // Yalnız cron / service role çağırabilsin. İmza gateway'de doğrulanıyor
    // (istek buraya ulaştıysa JWT geçerli) — burada role claim'i kontrol edilir.
    const auth = req.headers.get('Authorization') ?? ''
    let rol = ''
    try { rol = JSON.parse(atob((auth.replace(/^Bearer\s+/i, '').split('.')[1] || ''))).role || '' } catch { /* yut */ }
    if (rol !== 'service_role' && !auth.includes(SERVICE_ROLE)) {
      return new Response(JSON.stringify({ ok: false, hata: 'yetkisiz' }), { status: 401 })
    }
    const supa = createClient(SUPABASE_URL, SERVICE_ROLE)

    const { data: hareketler, error } = await supa
      .from('malzeme_hareketleri')
      .select('id, musteri_ad, urun_ad, miktar, faturalanan_miktar, birim_fiyat, para_birimi, fatura_durumu, teslim_tarihi, olusturma_tarih, proforma_no')
      .eq('aktif', true)
      .in('fatura_durumu', BEKLEYEN)
    if (error) throw error

    const simdi = Date.now()
    const gun = (h: any) => {
      const t = h.teslim_tarihi || h.olusturma_tarih
      return t ? Math.max(0, Math.floor((simdi - new Date(t).getTime()) / 86400000)) : 0
    }
    const tutar = (h: any) =>
      Math.max(0, Number(h.miktar || 0) - Number(h.faturalanan_miktar || 0)) * Number(h.birim_fiyat || 0)

    const liste = hareketler ?? []
    if (!liste.length) return new Response(JSON.stringify({ ok: true, bekleyen: 0, bildirim: 0 }))

    // Özet metrikler
    const tutarlar: Record<string, number> = {}
    for (const h of liste) {
      const pb = h.para_birimi || 'TL'
      tutarlar[pb] = (tutarlar[pb] || 0) + tutar(h)
    }
    const g7 = liste.filter(h => gun(h) >= 7).length
    const g15 = liste.filter(h => gun(h) >= 15).length
    const g30 = liste.filter(h => gun(h) >= 30).length
    const proformaBekleyen = liste.filter(h =>
      ['proforma_hazirlandi', 'proforma_gonderildi', 'musteri_onayi_bekleniyor'].includes(h.fatura_durumu) && gun(h) >= 7,
    ).length

    // En çok bekleten 3 müşteri
    const musteriTutar = new Map<string, number>()
    for (const h of liste) {
      const ad = h.musteri_ad || 'Bilinmeyen'
      // Karma para birimi kaba toplanır — bildirim metni için yeterli
      musteriTutar.set(ad, (musteriTutar.get(ad) || 0) + tutar(h))
    }
    const enCok = [...musteriTutar.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([ad]) => ad).join(', ')

    const tutarStr = Object.entries(tutarlar)
      .filter(([, t]) => t > 0)
      .map(([pb, t]) => `${PB_SEMBOL[pb] || pb}${Math.round(t).toLocaleString('tr-TR')}`)
      .join(' + ') || '—'

    const parcalar = [
      `${liste.length} kalem fatura bekliyor (${tutarStr}).`,
      g15 > 0 ? `${g15} kalem 15 günü aştı${g30 > 0 ? ` (${g30}'u 30+)` : ''}.` : (g7 > 0 ? `${g7} kalem 7 günü aştı.` : ''),
      proformaBekleyen > 0 ? `${proformaBekleyen} proforma 7+ gündür faturaya dönmedi.` : '',
      enCok ? `En çok bekleten: ${enCok}.` : '',
    ].filter(Boolean)

    // Alıcılar: muhasebe (fatura yetkilisi) + adminler
    const { data: kisiler } = await supa
      .from('kullanicilar')
      .select('id')
      .eq('tip', 'zna')
      .or('fatura_yetkilisi.eq.true,rol.eq.admin')
    const alicilar = [...new Set((kisiler ?? []).map(k => k.id))]

    let bildirim = 0
    for (const aliciId of alicilar) {
      const { error: bErr } = await supa.from('bildirimler').insert({
        alici_id: aliciId,
        baslik: `🧾 Fatura takibi — ${liste.length} kalem bekliyor`,
        mesaj: parcalar.join(' ').slice(0, 240),
        tip: 'uyari',
        link: '/kullanilan-malzemeler',
        meta: { kaynak: 'malzeme_uyari', bekleyen: liste.length, g7, g15, g30 },
      })
      if (!bErr) bildirim++
    }

    return new Response(JSON.stringify({ ok: true, bekleyen: liste.length, g7, g15, g30, proformaBekleyen, bildirim }))
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, hata: (e as Error).message }), { status: 500 })
  }
})
