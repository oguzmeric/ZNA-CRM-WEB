// Mobiltek /v1/vehicles/ için ORTAK, ÖNBELLEKLİ erişim (mig 316).
//
// SORUN: beş fonksiyon (proxy, rota-kaydet, kontak-izle, km-sync,
// yakinlik-tara) aynı ucu birbirinden habersiz çağırıyordu. Web sayfası her
// yenilemede AYNI veriyi iki kez çekiyordu (proxy + yakınlık taraması), N açık
// sekme = N upstream istek. Aylık sorgulama kotası bu yüzden ayın ~10'unda
// doldu (19.08 teşhisi).
//
// ÇÖZÜM: yanıt `mobiltek_yanit_cache` tablosunda paylaşılır (in-memory Map
// DEĞİL — edge instance'ları arasında paylaşılmıyor). TTL içinde soran herkes
// önbellekten okur; Mobiltek'e ve kota sayacına tek istek düşer.
//
//   BASARI_TTL_SN = 55  → kullanıcı polling'i 60 sn; cron'lar */5 aynı
//                         dakikada tetiklenince ikincisi önbellekten okur.
//   HATA_TTL_SN  = 600  → kota doluyken her turda boşuna istek atılmasın;
//                         kota yenilendiğini en geç 10 dk gecikmeyle fark
//                         ederiz, kabul edilebilir.
//
// Bayatlık güvenliği: TTL dolduysa DAİMA canlıya gidilir; canlı istek
// patlarsa bayat veri DÖNDÜRÜLMEZ (konum verisinde "eskiyi şimdi sanmak"
// rota/kontak tespitini bozar) — hata döner, çağıran zaten hatayı işliyor.

import { mobiltekYanitHatasi, kotaHatasiMi } from './mobiltekYanit.ts'

const MOBILTEK_VEHICLES_URL = 'https://api.mobiltek.com.tr/v1/vehicles/'
const ANAHTAR = 'vehicles'
const BASARI_TTL_SN = 55
const HATA_TTL_SN = 600

export type VehiclesSonuc = {
  // deno-lint-ignore no-explicit-any — çağıranlar veri.vehicles üzerinde
  // esnek alan erişimi yapıyor (Mobiltek şeması araca göre değişken)
  veri?: any
  hata?: string
  kota?: boolean
  kaynak: 'onbellek' | 'canli' | 'yok'
}

// deno-lint-ignore no-explicit-any
export async function vehiclesGetir(sb: any, token: string): Promise<VehiclesSonuc> {
  // 1) Önbellek
  const { data: cache } = await sb
    .from('mobiltek_yanit_cache')
    .select('yanit, hata, olusturma_tarih')
    .eq('anahtar', ANAHTAR)
    .maybeSingle()

  if (cache) {
    const yasSn = (Date.now() - new Date(cache.olusturma_tarih).getTime()) / 1000
    const ttl = cache.hata ? HATA_TTL_SN : BASARI_TTL_SN
    if (yasSn < ttl) {
      if (cache.hata) {
        return {
          hata: mobiltekYanitHatasi(cache.yanit) ?? 'Mobiltek hatası (önbellek)',
          kota: kotaHatasiMi(cache.yanit),
          kaynak: 'onbellek',
        }
      }
      return { veri: cache.yanit, kaynak: 'onbellek' }
    }
  }

  // 2) Canlı istek
  let veri: Record<string, unknown>
  try {
    const r = await fetch(MOBILTEK_VEHICLES_URL, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!r.ok) return { hata: `mobiltek ${r.status}`, kaynak: 'yok' }
    veri = await r.json()
  } catch (e) {
    return { hata: `mobiltek erişilemedi: ${(e as Error)?.message ?? e}`, kaynak: 'yok' }
  }

  // 3) Uygulama-seviyesi hata (code:40 vb.) — HATA OLARAK önbelleğe yazılır
  //    ki kota dolu dönemde arkadan gelenler 10 dk boyunca upstream'i yormasın.
  const uygulamaHatasi = mobiltekYanitHatasi(veri)
  await sb.from('mobiltek_yanit_cache').upsert({
    anahtar: ANAHTAR,
    yanit: veri,
    hata: !!uygulamaHatasi,
    olusturma_tarih: new Date().toISOString(),
  })

  if (uygulamaHatasi) {
    return { hata: uygulamaHatasi, kota: kotaHatasiMi(veri), kaynak: 'canli' }
  }
  return { veri, kaynak: 'canli' }
}
