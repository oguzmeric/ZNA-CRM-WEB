// gorev-gunluk-tara — günlük görev otomasyonu (cron 05:30 UTC = 08:30 TR)
// Spek madde 25 (hatırlatmalar), 26 (geciken yönetimi), 28 (tekrarlayan görevler),
// 39 (vekâlet temizliği). Bildirimler bildirimler tablosuna INSERT edilir;
// push zinciri (tr_bildirim_push → push-gonder → Expo) otomatik tetiklenir.
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const KAPALI = ['tamamlandi', 'iptal', 'reddedildi']
// Gecikme bildirimi spam'lenmesin: yalnız bu günlerde uyar (madde 26)
const GECIKME_UYARI_GUNLERI = [1, 3, 7, 14, 30]

const bugunTR = () => {
  const s = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' })
  return s // YYYY-MM-DD
}

const gunFark = (a: string, b: string) =>
  Math.round((new Date(a + 'T00:00:00Z').getTime() - new Date(b + 'T00:00:00Z').getTime()) / 86400000)

const tarihEkle = (t: string, gun: number) => {
  const d = new Date(t + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + gun)
  return d.toISOString().slice(0, 10)
}

const trTarih = (t: string | null) => (t ? String(t).slice(0, 10).split('-').reverse().join('.') : '—')

// Bir sonraki üretim tarihi (bugünden SONRAKİ ilk uygun gün)
function sonrakiUretim(siklik: string, gunler: number[], bugun: string): string {
  if (siklik === 'gunluk') return tarihEkle(bugun, 1)
  if (siklik === 'yillik') {
    const d = new Date(bugun + 'T00:00:00Z')
    d.setUTCFullYear(d.getUTCFullYear() + 1)
    return d.toISOString().slice(0, 10)
  }
  if (siklik === 'haftalik') {
    const hedefler = (gunler?.length ? gunler : [1]).map(g => ((g - 1) % 7)) // ISO 1-7 → 0-6 (Pzt=0)
    for (let i = 1; i <= 7; i++) {
      const aday = tarihEkle(bugun, i)
      const iso = (new Date(aday + 'T00:00:00Z').getUTCDay() + 6) % 7 // Pzt=0
      if (hedefler.includes(iso)) return aday
    }
    return tarihEkle(bugun, 7)
  }
  // aylik — gunler: ayın günleri; 32 = ayın son iş günü
  const hedefler = gunler?.length ? gunler : [1]
  for (let i = 1; i <= 62; i++) {
    const aday = tarihEkle(bugun, i)
    const d = new Date(aday + 'T00:00:00Z')
    const gun = d.getUTCDate()
    const sonGun = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
    let sonIs = sonGun.getUTCDate()
    const sonHafta = sonGun.getUTCDay() // 0=Paz 6=Cmt
    if (sonHafta === 0) sonIs -= 2
    else if (sonHafta === 6) sonIs -= 1
    if (hedefler.includes(gun) || (hedefler.includes(32) && gun === sonIs)) return aday
  }
  return tarihEkle(bugun, 30)
}

Deno.serve(async (req) => {
  // Auth: yalnız service_role (cron) — JWT payload'daki role claim'e bak
  const auth = req.headers.get('Authorization') ?? ''
  let rol = ''
  try { rol = JSON.parse(atob((auth.replace(/^Bearer\s+/i, '').split('.')[1] || ''))).role || '' } catch { /* yut */ }
  if (rol !== 'service_role' && !auth.includes(SERVICE_ROLE)) {
    return new Response(JSON.stringify({ ok: false, hata: 'yetkisiz' }), { status: 401 })
  }

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE)
  const bugun = bugunTR()
  const ozet = { gecikmeBildirim: 0, hatirlatma: 0, uretilen: 0, vekaletKapatilan: 0, yoneticiOzeti: false }

  const bildir = async (aliciId: number, baslik: string, mesaj: string, link: string) => {
    if (!aliciId) return
    await supa.from('bildirimler').insert({ alici_id: aliciId, baslik, mesaj, tip: 'gorev', link })
  }

  try {
    // ── 1) Açık görevleri çek ────────────────────────────────────────────────
    const { data: acikGorevler } = await supa.from('gorevler')
      .select('id, gorev_no, baslik, durum, atanan_id, atanan_ad, olusturan_id, olusturan_ad, son_tarih, hatirlatmalar, oncelik, ust_gorev_id')
      .not('durum', 'in', `(${KAPALI.join(',')})`)
      .not('son_tarih', 'is', null)

    const gecikenler = (acikGorevler || []).filter(g => g.son_tarih < bugun)

    // ── 2) Gecikme bildirimleri (1/3/7/14/30. günlerde) ─────────────────────
    for (const g of gecikenler) {
      const gun = gunFark(bugun, g.son_tarih)
      const gunlukIste = Array.isArray(g.hatirlatmalar) &&
        g.hatirlatmalar.some((h: { tip?: string }) => h?.tip === 'gun_geciti_gunluk')
      if (!GECIKME_UYARI_GUNLERI.includes(gun) && !gunlukIste) continue
      const mesaj = `"${g.baslik}" (${g.gorev_no || ''}) ${gun} gündür gecikmiş durumda — son tarih ${trTarih(g.son_tarih)}.`
      const alicilar = new Set<number>()
      if (g.atanan_id) alicilar.add(g.atanan_id)
      if (g.olusturan_id && g.olusturan_id !== g.atanan_id) alicilar.add(g.olusturan_id)
      for (const a of alicilar) {
        await bildir(a, '⏰ Geciken görev', mesaj, `/gorevler/${g.id}`)
        ozet.gecikmeBildirim++
      }
    }

    // ── 3) Yaklaşan tarih hatırlatmaları (gun_once) ─────────────────────────
    for (const g of (acikGorevler || [])) {
      if (g.son_tarih < bugun) continue
      const kalanGun = gunFark(g.son_tarih, bugun)
      const kurallar = Array.isArray(g.hatirlatmalar) ? g.hatirlatmalar : []
      const eslesen = kurallar.some((h: { tip?: string; deger?: number }) =>
        h?.tip === 'gun_once' && Number(h.deger) === kalanGun)
      // Hatırlatma tanımlanmamışsa bile 1 gün kala varsayılan hatırlat
      const varsayilan = kurallar.length === 0 && kalanGun === 1
      if (!eslesen && !varsayilan) continue
      if (!g.atanan_id) continue
      await bildir(g.atanan_id, '📅 Görev tarihi yaklaşıyor',
        `"${g.baslik}" (${g.gorev_no || ''}) için son tarih ${kalanGun === 0 ? 'BUGÜN' : `${kalanGun} gün sonra`}: ${trTarih(g.son_tarih)}.`,
        `/gorevler/${g.id}`)
      ozet.hatirlatma++
    }

    // ── 4) Yönetici gecikme özeti (tek bildirim, madde 34) ──────────────────
    if (gecikenler.length > 0) {
      const kisiler = new Map<string, number>()
      for (const g of gecikenler) {
        const ad = g.atanan_ad || '—'
        kisiler.set(ad, (kisiler.get(ad) || 0) + 1)
      }
      const kirilir = [...kisiler.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
        .map(([ad, n]) => `${ad}: ${n}`).join(' · ')
      const { data: adminler } = await supa.from('kullanicilar')
        .select('id').eq('rol', 'admin').eq('hesap_silindi', false)
      for (const a of (adminler || [])) {
        await bildir(a.id, `📊 ${gecikenler.length} geciken görev`,
          `Kişi kırılımı — ${kirilir}`, '/gorevler')
      }
      ozet.yoneticiOzeti = true
    }

    // ── 5) Tekrarlayan görev üretimi (madde 28) ─────────────────────────────
    const { data: tekrarlar } = await supa.from('gorev_tekrarlar')
      .select('*').eq('aktif', true)
    for (const t of (tekrarlar || [])) {
      // İlk kurulum: sonraki_uretim boşsa DÜN bazıyla hesapla — hesap BUGÜNÜ
      // veriyorsa aynı turda üret (continue edilirse ilk gün kaybolur,
      // denetim bulgusu 2026-07-19)
      if (!t.sonraki_uretim) {
        const ilkUretim = sonrakiUretim(t.siklik, t.gunler || [], tarihEkle(bugun, -1))
        await supa.from('gorev_tekrarlar').update({ sonraki_uretim: ilkUretim }).eq('id', t.id)
        t.sonraki_uretim = ilkUretim
      }
      if (t.sonraki_uretim > bugun) continue

      const s = t.sablon?.gorev || {}
      const atananId = Number(s.atananId) || null
      let atananAd: string | null = null
      if (atananId) {
        const { data: k } = await supa.from('kullanicilar').select('ad').eq('id', atananId).maybeSingle()
        atananAd = k?.ad ?? null
      }
      const sonTarih = tarihEkle(bugun, Number(s.sureGun) || 1)
      const { data: yeni, error: insErr } = await supa.from('gorevler').insert({
        baslik: s.baslik || t.ad,
        aciklama: s.aciklama || null,
        durum: 'bekliyor',
        oncelik: s.oncelik || 'normal',
        atanan_id: atananId,
        atanan: atananId ? String(atananId) : null,
        atanan_ad: atananAd,
        son_tarih: sonTarih,
        bitis_tarihi: sonTarih,
        kategori_id: s.kategoriId || null,
        onay_gerekli: !!s.onayGerekli,
        beklenen_cikti: s.beklenenCikti || null,
        tamamlama_kurali: s.tamamlamaKurali || 'zorunlular',
        etiketler: Array.isArray(s.etiketler) ? s.etiketler : [],
        kabul_durumu: 'atandi',
        tekrar_id: t.id,
        olusturan_id: t.olusturan_id || null,
        olusturan_ad: 'Tekrarlayan Görev 🔁',
      }).select('id, gorev_no').single()

      if (insErr || !yeni) { console.error('[tekrar uretim]', t.id, insErr?.message); continue }

      // Alt görev şablonları
      for (const alt of (t.sablon?.altGorevler || [])) {
        const altAtanan = Number(alt.atananId) || atananId
        let altAd: string | null = atananAd
        if (altAtanan && altAtanan !== atananId) {
          const { data: k } = await supa.from('kullanicilar').select('ad').eq('id', altAtanan).maybeSingle()
          altAd = k?.ad ?? null
        }
        const altSon = tarihEkle(bugun, Number(alt.sureGun) || 1)
        const { data: altYeni, error: altErr } = await supa.from('gorevler').insert({
          baslik: alt.baslik, aciklama: alt.aciklama || null,
          durum: 'bekliyor', oncelik: alt.oncelik || 'normal',
          ust_gorev_id: yeni.id,
          atanan_id: altAtanan, atanan: altAtanan ? String(altAtanan) : null, atanan_ad: altAd,
          son_tarih: altSon, bitis_tarihi: altSon,
          zorunlu: alt.zorunlu !== false,
          kabul_durumu: 'atandi', tekrar_id: t.id,
          olusturan_id: t.olusturan_id || null,
          olusturan_ad: 'Tekrarlayan Görev 🔁',
        }).select('id').single()
        if (altErr || !altYeni) {
          console.error('[tekrar alt gorev]', t.id, alt.baslik, altErr?.message)
          continue
        }
        if (altAtanan) {
          await bildir(altAtanan, '📋 Yeni alt görev atandı',
            `"${s.baslik || t.ad}" kapsamında "${alt.baslik}" alt görevi (tekrarlayan plan). Son tarih: ${trTarih(altSon)}.`,
            `/gorevler/${altYeni.id}`)
        }
      }

      // Kontrol listesi şablonu
      const kontrol = (t.sablon?.kontrolListesi || []).map((m: { baslik: string; zorunlu?: boolean }, i: number) => ({
        gorev_id: yeni.id, baslik: m.baslik, zorunlu: !!m.zorunlu, sira: i,
      }))
      if (kontrol.length) await supa.from('gorev_kontrol_listesi').insert(kontrol)

      if (atananId) {
        await bildir(atananId, '🔁 Tekrarlayan görev oluştu',
          `"${s.baslik || t.ad}" (${yeni.gorev_no || ''}) — son tarih ${trTarih(sonTarih)}.`,
          `/gorevler/${yeni.id}`)
      }

      await supa.from('gorev_tekrarlar').update({
        son_uretim: bugun,
        sonraki_uretim: sonrakiUretim(t.siklik, t.gunler || [], bugun),
      }).eq('id', t.id)
      ozet.uretilen++
    }

    // ── 6) Süresi biten vekâletleri kapat (madde 39) ────────────────────────
    const { data: bitenler } = await supa.from('gorev_vekaletler')
      .update({ aktif: false }).eq('aktif', true).lt('bitis', bugun).select('id')
    ozet.vekaletKapatilan = bitenler?.length || 0

    return new Response(JSON.stringify({ ok: true, bugun, ...ozet }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('[gorev-gunluk-tara]', e)
    return new Response(JSON.stringify({ ok: false, hata: String((e as Error)?.message || e) }), { status: 500 })
  }
})
