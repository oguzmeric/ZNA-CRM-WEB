// Portal talebi YÖNLENDİRME (21.08 kullanıcı isteği): portal kuyruğuna düşen
// talep tek noktadan türüne göre yönlendirilir — Görüşme / Keşif / Görev /
// Teklif talebi. Servis işiyse mevcut atama akışı kullanılır (bu dosya değil).
//
// Tasarım kuralları (mevcut 14 dönüşüm deseninden damıtıldı):
//   • Kaynak bağı KOLONLA kurulur, metinle değil (GorusmeDetay kuralı):
//     görüşme → servis_talepleri.gorusme_id, görev → çift yön
//     (gorevler.servis_talep_id + servis_talepleri.gorev_id,
//     talepOlusturGorevden'in tersi), keşif → kesifler.servis_talep_id.
//     Teklif talebinde köprü kolonu yok — referans açıklama metninde taşınır.
//   • Talep AÇIK KALIR (müşteri portalda takibini sürdürür — 21.08 kararı);
//     'bekliyor' ise 'inceleniyor'a çekilir, durum geçmişine
//     tip:'yonlendirme' kaydı düşer.
//   • Oluşturma başarısızsa THROW — sessiz yutma yok; talep işaretlemesi
//     ancak hedef kayıt gerçekten oluştuysa yapılır.
import { gorusmeEkle } from './gorusmeService'
import { gorevEkle } from './gorevService'
import { kesifEkle } from './kesifService'
import { musteriTalepEkle } from './teklifService'
import { servisTalepGuncelle } from './servisService'

// Talep üzerine yönlendirme izi işle: bağ kolonları + durum + geçmiş kaydı
const talebiIsaretle = async (talep, kullanici, aciklama, ekAlanlar = {}) => {
  const guncel = await servisTalepGuncelle(talep.id, {
    ...ekAlanlar,
    durum: talep.durum === 'bekliyor' ? 'inceleniyor' : talep.durum,
    durumGecmisi: [
      ...(talep.durumGecmisi || []),
      {
        tip: 'yonlendirme',
        durum: talep.durum === 'bekliyor' ? 'inceleniyor' : talep.durum,
        tarih: new Date().toISOString(),
        kullaniciAd: kullanici?.ad || '',
        aciklama,
      },
    ],
  })
  if (!guncel) {
    // Hedef kayıt OLUŞTU ama talep işaretlenemedi — kullanıcı bunu bilmeli
    throw new Error('Kayıt oluşturuldu ancak talep üzerine bağ yazılamadı. Talebi elle güncelleyin.')
  }
  return guncel
}

const referansMetni = (talep) =>
  `${talep.talepNo || '#' + talep.id} numaralı portal talebinden yönlendirildi.`

// ── Görüşme ────────────────────────────────────────────────────────────────
export const talebiGorusmeyeYonlendir = async (talep, kullanici) => {
  const yeni = await gorusmeEkle({
    firmaAdi: talep.firmaAdi || talep.musteriAd || '',
    musteriId: talep.musteriId || null,
    muhatapAd: talep.ilgiliKisi || talep.musteriAd || '',
    konu: talep.konu || 'Portal talebi',
    irtibatSekli: 'diger',
    gorusen: kullanici?.ad || '',
    takipNotu: [referansMetni(talep), talep.aciklama || ''].filter(Boolean).join('\n\n'),
    durum: 'acik',
    tarih: new Date().toISOString().slice(0, 10),
    lokasyonId: talep.lokasyonId || null,
    olusturanId: kullanici?.id ?? null,
  })
  if (!yeni) throw new Error('Görüşme kaydı oluşturulamadı.')

  await talebiIsaretle(talep, kullanici,
    `Görüşmeye yönlendirildi (${yeni.aktNo || yeni.gorusmeNo || '#' + yeni.id})`,
    { gorusmeId: yeni.id })
  return { tur: 'gorusme', id: yeni.id, no: yeni.aktNo || yeni.gorusmeNo || `#${yeni.id}`, yol: `/gorusmeler/${yeni.id}` }
}

// ── Keşif ──────────────────────────────────────────────────────────────────
export const talebiKesfeYonlendir = async (talep, kullanici) => {
  const yeni = await kesifEkle({
    servisTalepId: talep.id,               // bağ kolonla (kesifler.servis_talep_id)
    musteriId: talep.musteriId || null,
    firmaAdi: talep.firmaAdi || talep.musteriAd || '',
    projeAdi: talep.konu || '',
    kesifBasligi: talep.konu ? `${talep.konu} keşfi` : 'Portal talebi keşfi',
    musteriYetkilisi: talep.ilgiliKisi || talep.musteriAd || '',
    yetkiliTelefon: talep.telefon || '',
    yetkiliEmail: talep.email || '',
    lokasyon: talep.lokasyon || '',
    lokasyonId: talep.lokasyonId || null,
    genelNot: [referansMetni(talep), talep.aciklama || ''].filter(Boolean).join('\n\n'),
    kesfiYapan: '',
    satisPersoneli: kullanici?.ad || '',
    durum: 'acik',
    oncelik: talep.aciliyet === 'acil' ? 'yuksek' : 'normal',
    olusturanId: kullanici?.id ? Number(kullanici.id) : null,
    olusturanAd: kullanici?.ad || '',
  })
  // kesifEkle hata durumunda zaten throw eder
  await talebiIsaretle(talep, kullanici,
    `Keşfe yönlendirildi (${yeni.kesifNo || '#' + yeni.id})`)
  return { tur: 'kesif', id: yeni.id, no: yeni.kesifNo || `#${yeni.id}`, yol: `/kesifler/${yeni.id}` }
}

// ── Görev ──────────────────────────────────────────────────────────────────
// atama: { atananId, atananAd, sonTarih } — hepsi opsiyonel
export const talebiGoreveYonlendir = async (talep, kullanici, atama = {}) => {
  const yeni = await gorevEkle({
    baslik: talep.konu || 'Portal talebi',
    aciklama: [referansMetni(talep), talep.aciklama || ''].filter(Boolean).join('\n\n'),
    durum: 'bekliyor',
    oncelik: talep.aciliyet === 'acil' || talep.aciliyet === 'yuksek' ? 'yuksek' : 'orta',
    atananId: atama.atananId || null,
    atananAd: atama.atananAd || '',
    olusturanAd: kullanici?.ad || '',
    bitisTarihi: atama.sonTarih || null,
    firmaAdi: talep.firmaAdi || talep.musteriAd || '',
    musteriId: talep.musteriId || null,
    lokasyonId: talep.lokasyonId || null,
    servisTalepId: talep.id,               // çift yönün görev tarafı
    gorusmeId: talep.gorusmeId || null,
  })
  if (!yeni) throw new Error('Görev oluşturulamadı.')

  await talebiIsaretle(talep, kullanici,
    `Göreve yönlendirildi${atama.atananAd ? ` (${atama.atananAd})` : ''}`,
    { gorevId: yeni.id })                  // çift yönün talep tarafı

  // Atanana bildirim ÇAĞIRAN tarafta atılır (useBildirim context hook'u —
  // servis katmanından erişilemez); dönüşte atananId taşınır.
  return {
    tur: 'gorev', id: yeni.id, no: `#${yeni.id}`, yol: `/gorevler/${yeni.id}`,
    baslik: yeni.baslik, atananId: atama.atananId || null,
  }
}

// ── Teklif talebi ──────────────────────────────────────────────────────────
export const talebiTeklifeYonlendir = async (talep, kullanici) => {
  const yeni = await musteriTalepEkle({
    musteriId: talep.musteriId || null,
    firmaAdi: talep.firmaAdi || talep.musteriAd || '',
    urunler: [],
    aciklama: [referansMetni(talep), `Konu: ${talep.konu || '—'}`, talep.aciklama || '']
      .filter(Boolean).join('\n\n'),
    iletisimKisi: talep.ilgiliKisi || talep.musteriAd || '',
    telefon: talep.telefon || '',
    durum: 'bekliyor',
  })
  // musteriTalepEkle hata durumunda zaten throw eder
  await talebiIsaretle(talep, kullanici,
    `Teklif talebine yönlendirildi (${yeni.talepNo || '#' + yeni.id})`)
  return { tur: 'teklif', id: yeni.id, no: yeni.talepNo || `#${yeni.id}`, yol: '/teklifler?sekme=musteri_talepleri' }
}
