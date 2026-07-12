// sabah-ozeti — Yönetici Sabah Özeti (mig 144).
// Her sabah 05:00 UTC (08:00 TR, hafta içi) pg_cron çağırır; 10 kalemi sayar,
// SADECE yetkili yöneticilere (aşağıdaki ALICILAR listesi) push atar.
// Detaylı görünüm: /sabah-ozeti sayfası (aynı kalemleri anlık hesaplar).
//
// Kalemler: bugünkü keşifler · bugünkü servisler · geciken görevler ·
// onay bekleyen teklifler · vadesi geçen tahsilatlar · kritik stok ·
// bitecek sözleşmeler · bitecek Trassir lisansları · açık ön siparişler ·
// serviste (RMA) bekleyen cihazlar.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Sabah özeti alıcıları — kullanicilar.id
// 1 = ALİ UĞUR AKTEPE, 2 = OĞUZ MERİÇ (Ahmet eklenecekse id'sini buraya ekle)
const ALICILAR = [1, 2]

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

const trBugun = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // ── Yetki: cron secret VEYA geçerli JWT ──
    const cronSecret = req.headers.get('X-Cron-Secret') ?? ''
    const beklenen = Deno.env.get('ESN_CRON_SECRET') ?? ''
    let yetkili = beklenen !== '' && cronSecret === beklenen
    if (!yetkili) {
      const authHeader = req.headers.get('Authorization') ?? ''
      if (authHeader) {
        const usr = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_ANON_KEY')!,
          { global: { headers: { Authorization: authHeader } } },
        )
        const { data: authRes } = await usr.auth.getUser()
        yetkili = !!authRes?.user
      }
    }
    if (!yetkili) return json({ ok: false, hata: 'yetkisiz' }, 401)

    const bugun = trBugun()
    const gun30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)

    // ── Kalem sayıları (paralel) ──
    const [
      kesifler, servisBugun, servisAktif, gecikenGorev, onayBekleyenTeklif,
      vadesiGecen, sozlesmeler, lisanslar, onSiparisler, rmaBekleyen,
    ] = await Promise.all([
      svc.from('kesifler').select('id', { count: 'exact', head: true })
        .eq('kesif_tarihi', bugun).neq('durum', 'iptal'),
      svc.from('servis_talepleri').select('id', { count: 'exact', head: true })
        .gte('olusturma_tarihi', bugun + 'T00:00:00'),
      svc.from('servis_talepleri').select('id', { count: 'exact', head: true })
        .in('durum', ['atandi', 'inceleniyor', 'devam_ediyor']),
      svc.from('gorevler').select('id', { count: 'exact', head: true })
        .lt('bitis_tarihi', bugun).neq('durum', 'tamamlandi'),
      svc.from('teklifler').select('id', { count: 'exact', head: true })
        .eq('spek_durum', 'yon_onay_bekliyor'),
      svc.from('satislar').select('id', { count: 'exact', head: true })
        .lt('vade_tarihi', bugun).neq('durum', 'odendi').neq('durum', 'iptal'),
      svc.from('sozlesmeler').select('id', { count: 'exact', head: true })
        .eq('aktif', true).lte('bitis_tarih', gun30),
      svc.from('trassir_lisanslar').select('id', { count: 'exact', head: true })
        .lte('bitis_tarihi', gun30).gte('bitis_tarihi', '2000-01-01'),
      svc.from('on_siparisler').select('id', { count: 'exact', head: true })
        .eq('durum', 'onay_bekliyor'),
      svc.from('stok_rma_kayitlari').select('id', { count: 'exact', head: true })
        .is('geri_donus_tarih', null),
    ])

    // Kritik stok — depoService mantığının sunucu kopyası
    let kritikStok = 0
    try {
      const { data: urunler } = await svc.from('stok_urunler')
        .select('stok_kodu, stok_miktari, min_stok, seri_takipli')
        .gt('min_stok', 0)
      const takipliler = (urunler ?? []).filter((u: any) => u.seri_takipli).map((u: any) => u.stok_kodu)
      const sayilar = new Map<string, number>()
      if (takipliler.length) {
        const { data: kalemler } = await svc.from('stok_kalemleri')
          .select('stok_kodu')
          .in('stok_kodu', takipliler)
          .eq('silindi', false)
          .eq('durum', 'depoda')
        for (const k of kalemler ?? []) sayilar.set(k.stok_kodu, (sayilar.get(k.stok_kodu) || 0) + 1)
      }
      kritikStok = (urunler ?? []).filter((u: any) => {
        const bakiye = u.seri_takipli ? (sayilar.get(u.stok_kodu) || 0) : (u.stok_miktari || 0)
        return bakiye < u.min_stok
      }).length
    } catch (_) { /* kritik stok hesaplanamazsa 0 */ }

    const kalemler = [
      { ad: 'keşif',                 n: kesifler.count ?? 0 },
      { ad: 'yeni servis',           n: servisBugun.count ?? 0 },
      { ad: 'devam eden servis',     n: servisAktif.count ?? 0 },
      { ad: 'geciken görev',         n: gecikenGorev.count ?? 0 },
      { ad: 'onay bekleyen teklif',  n: onayBekleyenTeklif.count ?? 0 },
      { ad: 'vadesi geçen tahsilat', n: vadesiGecen.count ?? 0 },
      { ad: 'kritik stok',           n: kritikStok },
      { ad: 'bitecek sözleşme',      n: sozlesmeler.count ?? 0 },
      { ad: 'bitecek lisans',        n: lisanslar.count ?? 0 },
      { ad: 'açık ön sipariş',       n: onSiparisler.count ?? 0 },
      { ad: 'serviste cihaz (RMA)',  n: rmaBekleyen.count ?? 0 },
    ]

    // Push metni: sadece sıfır olmayan kalemler (boş kalem gürültü yapmasın)
    const dolu = kalemler.filter(k => k.n > 0)
    const mesaj = dolu.length
      ? dolu.map(k => `${k.n} ${k.ad}`).join(' · ')
      : 'Her şey yolunda — bekleyen kritik iş yok 🎉'

    const rows = ALICILAR.map(id => ({
      alici_id: id,
      tip: 'bilgi',
      baslik: '☀️ Günlük Özet',
      mesaj,
      link: '/gunluk-ozet',
    }))
    const { error: bilErr } = await svc.from('bildirimler').insert(rows)
    if (bilErr) return json({ ok: false, hata: 'bildirim: ' + bilErr.message }, 500)

    return json({ ok: true, alicilar: ALICILAR, kalemler, mesaj })
  } catch (e) {
    return json({ ok: false, hata: String((e as any)?.message ?? e) }, 500)
  }
})
