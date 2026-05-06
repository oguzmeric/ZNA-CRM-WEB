// @mention helper'ları — yorum/notlarda kullanıcı etiketleme.
//
// Format: metinde @AdSoyad (boşluksuz) — örn. @FerdiKalkan
// Render: parseMentions ile span vurgulu hâle getirilir.
// Bildirim: parseAndExtractIds metnindeki @ token'larını kullanıcı id'lerine
//           çözer, mention edilen herkese bildirim gider.

import { trNormalize } from './trSearch'

const MENTION_REGEX = /@([\p{L}\p{N}_]+)/gu

// Kullanıcı adını mention token'ına çevir: "Ferdi Kalkan" → "FerdiKalkan"
export const adToMentionToken = (ad) => {
  if (!ad) return ''
  return ad.replace(/\s+/g, '').replace(/[^\p{L}\p{N}_]/gu, '')
}

// Metindeki @mention'lardan kullanıcı id'leri çıkar (eşleşmeyenler atlanır)
// Aynı kullanıcıya birden fazla mention varsa tek sefer döner (Set).
export const parseMentions = (metin, kullanicilar) => {
  if (!metin || !kullanicilar?.length) return []
  const eslesenIdler = new Set()
  const matches = [...metin.matchAll(MENTION_REGEX)]
  for (const m of matches) {
    const aranan = trNormalize(m[1])
    const kullanici = kullanicilar.find(k => {
      const token = trNormalize(adToMentionToken(k.ad))
      return token && token === aranan
    })
    if (kullanici) eslesenIdler.add(kullanici.id)
  }
  return [...eslesenIdler]
}

// Render için: metni segment'lere böl ([{ tip: 'text'|'mention', deger, kullanici? }])
export const segmentMetin = (metin, kullanicilar = []) => {
  if (!metin) return []
  const segmentler = []
  let lastIndex = 0
  for (const m of metin.matchAll(MENTION_REGEX)) {
    if (m.index > lastIndex) {
      segmentler.push({ tip: 'text', deger: metin.slice(lastIndex, m.index) })
    }
    const aranan = trNormalize(m[1])
    const kullanici = kullanicilar.find(k => trNormalize(adToMentionToken(k.ad)) === aranan)
    segmentler.push({
      tip: 'mention',
      deger: m[0],          // tam token (@FerdiKalkan)
      kullanici: kullanici || null,
    })
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < metin.length) {
    segmentler.push({ tip: 'text', deger: metin.slice(lastIndex) })
  }
  return segmentler
}
