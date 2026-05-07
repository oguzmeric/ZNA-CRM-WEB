import { aktifZimmetleriGetir, zimmetUyariFlag } from '../services/demoService'
import { bildirimEkleDb } from '../services/bildirimService'
import { kullanicilariGetir } from '../services/kullaniciService'

let calistiBuOturumda = false

export const demoBildirimleriniKontrolEt = async (kullanici) => {
  if (calistiBuOturumda) return
  calistiBuOturumda = true

  try {
    const aktif = await aktifZimmetleriGetir()
    const kullanicilar = await kullanicilariGetir()
    const adminler = (kullanicilar || []).filter(k => k.rol === 'admin')
    const bugun = new Date().toISOString().slice(0, 10)

    for (const z of aktif) {
      if (!z.beklenenIadeTarihi) continue
      const kalan = Math.floor((new Date(z.beklenenIadeTarihi) - new Date()) / 86400000)
      const cihazAd = z.cihaz?.ad || `Cihaz #${z.cihazId}`
      const firmaAd = z.musteri?.firma || `${z.musteri?.ad ?? ''} ${z.musteri?.soyad ?? ''}`.trim() || 'Müşteri'

      const aliciIdler = new Set([z.verenKullaniciId, ...adminler.map(a => a.id)].filter(Boolean))

      // 0 < kalan ≤ 3: kullanıcı arka arkaya gün açmasa da yine yakalanır
      if (kalan > 0 && kalan <= 3 && !z.uyari3gunKalaGonderildi) {
        for (const aliciId of aliciIdler) {
          await bildirimEkleDb({
            aliciId, gonderenId: kullanici?.id, tip: 'uyari',
            baslik: 'Demo iade tarihi yaklaşıyor',
            mesaj: `${cihazAd} demo cihazı ${kalan} gün sonra iade gelmeli — ${firmaAd}`,
            link: `/demolar/${z.cihazId}`,
          })
        }
        await zimmetUyariFlag(z.id, { uyari3gunKalaGonderildi: true })
      }

      if (kalan < 0 && z.uyariSuresiGectiSonGonderim !== bugun) {
        const gecikme = -kalan
        for (const aliciId of aliciIdler) {
          await bildirimEkleDb({
            aliciId, gonderenId: kullanici?.id, tip: 'hata',
            baslik: '⚠ Demo iade tarihi geçti',
            mesaj: `${cihazAd} demo cihazı ${gecikme} gündür gecikmiş — ${firmaAd}`,
            link: `/demolar/${z.cihazId}`,
          })
        }
        await zimmetUyariFlag(z.id, { uyariSuresiGectiSonGonderim: bugun })
      }
    }
  } catch (e) {
    console.warn('[demoBildirim] hata:', e?.message)
  }
}
