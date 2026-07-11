// Trassir/Karel teklif şablonlarında kullanılan sabit metinler.
// Excel orijinallerinden birebir alınmıştır. Değişirse buradan tek
// noktadan güncellenir; admin UI'sı yok (YAGNI).

export const ZNA_FIRMA = {
  unvan: 'ZNA TEKNOLOJİ BİLİŞİM HZM. SAN. VE TİC. LTD. ŞTİ.',
  adres: 'İ.O.S.B Keresteciler San. Sit. 3B Blok Kat:3 D:3  Başakşehir/İSTANBUL',
  vdNo: 'İkitelli V.D.NO: 9980827848',
  telFax: '0(212) 549 94 94 - (0212) 671 74 54',
  tel: '(0212) 671 74 54 & (0212) 549 94 94',
  email: 'info@znateknoloji.com',
  web: 'www.znateknoloji.com',
}

export const TRASSIR_KARSILAMA = `Bu doküman, talep ettiğiniz hizmete ait proje detaylarını kapsamaktadır. Projenin kapsamı, hizmet detayı ve proje bedeli hakkında da bilgi içermektedir. Başarılı çalışmalarınıza fark katacak desteği sağlayacağımıza inanıyor ve sizlere hizmet etmekten mutluluk duyacağımızı paylaşmak istiyoruz. Her türlü soru, sorun ve talebiniz için bizim ile iletişime geçmenizi rica ederiz.`

export const ZNA_HAKKINDA = `ZNA Teknoloji, Türkiye'de Elektronik Güvenlik, İletişim Teknolojileri ve Data Transfer sistemleri uygulamalarını gerçekleştirmek, geliştirmek ve yaygınlaştırmak amacıyla kurulmuştur. Fiber iletişim sistemlerinde anahtar teslimi çözümler üzerine de faaliyet gösteren ZNA Teknoloji, kullanım öncesi ve sonrası iletişim ve güvenlik sistemleri konularında projeler gerçekleştirmektedir. Güvenlik ve İletişim sistemlerinin kavram aşamasından başlayan hizmetler, tasarım, proje, inşa, ekipman imal, işletme becerisi transferi, periyodik bakım ve danışmanlık olarak sistemin tüm yaşamını kapsamaktadır.`

export const HIZMETLERIMIZ = [
  'Network tasarımı ve uygulamaları',
  'Sistem tasarımı ve uygulamaları',
  'Altyapı tasarımı ve uygulamaları',
  'Telekomünikasyon çözümleri',
  'Güvenlik Kamerası çözümleri',
  'Zayıf Akım sistemleri',
  'Güvenlik Kameralarında Yapay Zeka Destek Çözümleri',
  'Ürün tedariği',
  'Çözüm tasarımı',
  'Danışmanlık',
  'Değerlendirme',
]

// Şablon tipi → görünür isim
// 'Proje' varyantı = kalem birim fiyatları gizli, tek proje toplamı gösterilen versiyon
// (Kod içinde tip id'si backend'de _pacal olarak kalır; sadece UI'da 'Proje' gösterilir)
export const TEKLIF_TIPI_LABEL = {
  standart: 'Standart',
  standart_pacal: 'Standart Proje',
  trassir: 'Trassir',
  trassir_pacal: 'Trassir Proje',
  karel: 'Karel',
  karel_pacal: 'Karel Proje',
}

// tip='standart_pacal' → { baseTip: 'standart', pacal: true }
// tip='trassir' → { baseTip: 'trassir', pacal: false }
export function tipCoz(tip) {
  const pacal = typeof tip === 'string' && tip.endsWith('_pacal')
  const baseTip = pacal ? tip.replace('_pacal', '') : (tip || 'standart')
  return { baseTip, pacal }
}
