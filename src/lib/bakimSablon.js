// Toplu Bakım — kalem şablonları, doğrulama ve OTOMATİK SONUÇ METİNLERİ.
// Spec: 30 maddelik nihai işleyiş (2026-07-24). Metinler spec 8.6 / 9 / 10 / 11 / 12
// örnekleriyle birebir hizalıdır. Web F4 (PDF) aynı metinleri kullanacak.

export const BAKIM_KALEMLERI = {
  cctv:         { isim: 'CCTV / IP Kamera', ikon: 'video',    renk: '#3b82f6' },
  turnike:      { isim: 'Turnike / PDKS',   ikon: 'log-in',   renk: '#22c55e' },
  ekran_led:    { isim: 'Ekran / LED',      ikon: 'monitor',  renk: '#8b5cf6' },
  fiber:        { isim: 'Fiber',            ikon: 'zap',      renk: '#f59e0b' },
  hirsiz_alarm: { isim: 'Hırsız Alarm',     ikon: 'bell',     renk: '#ef4444' },
  sistem_odasi: { isim: 'Sistem Odası',     ikon: 'server',   renk: '#06b6d4' },
}

export const kalemBilgi = (tip) =>
  BAKIM_KALEMLERI[tip] ?? { isim: tip, ikon: 'tool', renk: '#94a3b8' }

export const KALEM_DURUMLAR = {
  baslanmadi:   { isim: 'Başlanmadı',       renk: '#94a3b8' },
  devam_ediyor: { isim: 'Devam Ediyor',     renk: '#3b82f6' },
  tamamlandi:   { isim: 'Tamamlandı',       renk: '#22c55e' },
  ariza_tespit: { isim: 'Arıza Tespit',     renk: '#ef4444' },
  yapilamadi:   { isim: 'Bakım Yapılamadı', renk: '#f59e0b' },
}

export const kalemDurumBilgi = (d) => KALEM_DURUMLAR[d] ?? { isim: d ?? '—', renk: '#94a3b8' }

export const TB_DURUMLAR = {
  planlandi:            { isim: 'Planlandı',            renk: '#94a3b8' },
  atandi:               { isim: 'Personele Atandı',     renk: '#3b82f6' },
  yola_cikildi:         { isim: 'Yola Çıkıldı',         renk: '#f59e0b' },
  lokasyona_ulasildi:   { isim: 'Lokasyona Ulaşıldı',   renk: '#f59e0b' },
  bakim_basladi:        { isim: 'Bakım Başladı',        renk: '#8b5cf6' },
  devam_ediyor:         { isim: 'Devam Ediyor',         renk: '#8b5cf6' },
  eksik_bakim:          { isim: 'Eksik Bakım',          renk: '#ef4444' },
  imza_bekleniyor:      { isim: 'İmza Bekleniyor',      renk: '#eab308' },
  tamamlandi:           { isim: 'Tamamlandı',           renk: '#22c55e' },
  yonetici_kontrolunde: { isim: 'Yönetici Kontrolünde', renk: '#06b6d4' },
  musteriye_gonderildi: { isim: 'Müşteriye Gönderildi', renk: '#10b981' },
  iptal:                { isim: 'İptal Edildi',         renk: '#64748b' },
}

export const tbDurumBilgi = (d) => TB_DURUMLAR[d] ?? { isim: d ?? '—', renk: '#94a3b8' }

export const YAPILAMADI_SEBEPLERI = [
  'Sisteme erişim sağlanamadı',
  'Müşteri izin vermedi',
  'Sistem kullanımdaydı',
  'Elektrik bulunmuyordu',
  'Yetkili kişi bulunamadı',
  'Sistem lokasyonda bulunamadı',
  'Diğer',
]

export const KAYIT_CIHAZI_TURLERI = ['NVR', 'Sunucu', 'NVR ve Sunucu', 'DVR', 'Hibrit', 'Diğer']

export const HDD_KAPASITELERI = ['1 TB', '2 TB', '4 TB', '6 TB', '8 TB', '10 TB', '12 TB', '14 TB', '16 TB', '18 TB', '20 TB', 'Diğer']

export const SAAT_TARIH_SECENEKLERI = [
  { id: 'guncel',            isim: 'Güncel' },
  { id: 'duzeltildi',        isim: 'Güncel değildi, düzeltildi' },
  { id: 'guncel_degil',      isim: 'Güncel değil' },
  { id: 'kontrol_edilemedi', isim: 'Kontrol edilemedi' },
]

// ── Doğrulama ───────────────────────────────────────────────────────────────

// CCTV zorunlu kuralları (spec 8): kamera eşitliği ŞART, sayılar tutmazsa
// bakım tamamlanamaz. Dönen: hata metni ya da null.
export function cctvDogrula(c) {
  const toplam = Number(c.toplamKamera)
  const calisan = Number(c.calisanKamera)
  const arizali = Number(c.arizaliKamera)
  if (!c.saatTarih) return 'Saat ve tarih kontrolü seçilmedi.'
  if (!Number.isFinite(toplam) || toplam <= 0) return 'Toplam kamera sayısı girilmedi.'
  if (!Number.isFinite(calisan) || calisan < 0) return 'Çalışan kamera sayısı girilmedi.'
  if (!Number.isFinite(arizali) || arizali < 0) return 'Arızalı kamera sayısı girilmedi.'
  if (toplam !== calisan + arizali) {
    return `Sayılar eşleşmiyor: Toplam (${toplam}) = Çalışan (${calisan}) + Arızalı (${arizali}) olmalı.`
  }
  if (!c.kayitCihazlari?.length) return 'En az bir kayıt cihazı ekleyin.'
  for (const k of c.kayitCihazlari) {
    if (!k.tur) return 'Kayıt cihazı türü seçilmedi.'
    if (!Number(k.kayitGun)) return `${k.tur} için kayıt süresi (gün) girilmedi.`
  }
  return null
}

// Genel şablon doğrulama (turnike/ekran/alarm/sistem odası/fiber v1)
export function genelDogrula(c) {
  if (c.sonucDurum !== 'sorunsuz' && c.sonucDurum !== 'arizali') return 'Bakım sonucu (sorunsuz/arızalı) seçilmedi.'
  if (c.sonucDurum === 'arizali' && !Number(c.arizaliAdet)) return 'Arızalı adet girilmedi.'
  return null
}

// Arıza var mı? (otomatik servis talebi tetikleyicisi — spec 17)
export function arizaVarMi(tip, c) {
  if (tip === 'cctv') {
    return Number(c.arizaliKamera) > 0 ||
      c.saatTarih === 'guncel_degil' || c.saatTarih === 'kontrol_edilemedi'
  }
  return c.sonucDurum === 'arizali'
}

// ── Sonuç metinleri ─────────────────────────────────────────────────────────

// Cihaz adı: özel ad varsa o, yoksa tür; aynı türden birden çok adsız cihaz
// varsa numaralandır ("NVR 1", "NVR 2").
const cihazAdiMetni = (k, i, tumCihazlar = []) => {
  if (k.ad) return k.ad
  const ayniTur = tumCihazlar.filter((x) => !x.ad && x.tur === k.tur)
  if (ayniTur.length > 1) {
    const sira = ayniTur.indexOf(k) + 1
    return `${k.tur} ${sira}`
  }
  return k.tur
}

// CCTV — spec 8.6 birebir
export function cctvSonucMetni(c) {
  const p = []
  p.push('Güvenlik kamera sisteminin periyodik bakım kontrolleri gerçekleştirilmiştir.')

  if (c.saatTarih === 'guncel') {
    p.push('Güvenlik kamera sistemi ile kayıt cihazlarının saat ve tarih ayarlarının güncel olduğu kontrol edilmiştir.')
  } else if (c.saatTarih === 'duzeltildi') {
    p.push('Güvenlik kamera sistemi ile kayıt cihazlarının saat ve tarih ayarlarında uyumsuzluk tespit edilmiş, gerekli düzenleme yapılarak saat ve tarih ayarları güncellenmiştir.')
  } else if (c.saatTarih === 'guncel_degil') {
    p.push('Güvenlik kamera sistemi ile kayıt cihazlarının saat ve tarih ayarlarının güncel olmadığı tespit edilmiştir. Konuya ilişkin servis talebiniz oluşturulmuştur.')
  } else if (c.saatTarih === 'kontrol_edilemedi') {
    p.push('Güvenlik kamera sistemi ile kayıt cihazlarının saat ve tarih ayarları kontrol edilememiştir. Konuya ilişkin servis talebiniz oluşturulmuştur.')
  }

  const toplam = Number(c.toplamKamera), calisan = Number(c.calisanKamera), arizali = Number(c.arizaliKamera)
  if (arizali > 0) {
    p.push(`Lokasyonda toplam ${toplam} adet güvenlik kamerası bulunmakta olup ${calisan} adet kamera çalışır durumda, ${arizali} adet kamera ise arızalıdır.`)
  } else {
    p.push(`Lokasyonda toplam ${toplam} adet güvenlik kamerası bulunmakta olup kameraların tamamı çalışır durumdadır.`)
  }

  // Kayıt süreleri — tek cihaz: "NVR kayıt cihazının 30 gün süreyle kayıt yaptığı
  // kontrol edilmiştir." Çoklu: "…NVR kayıt cihazının 30 gün, kamera sunucusunun
  // ise 25 gün süreyle…"
  const cihazlar = c.kayitCihazlari || []
  if (cihazlar.length === 1) {
    p.push(`${cihazAdiMetni(cihazlar[0], 0, cihazlar)} kayıt cihazının ${cihazlar[0].kayitGun} gün süreyle kayıt yaptığı kontrol edilmiştir.`)
  } else if (cihazlar.length > 1) {
    const parcalar = cihazlar.map((k, i) => {
      const son = i === cihazlar.length - 1
      return `${cihazAdiMetni(k, i, cihazlar)}${son ? ' ise' : ''} ${k.kayitGun} gün`
    })
    p.push(`Lokasyonda bulunan ${parcalar.join(', ')} süreyle kayıt yapıldığı kontrol edilmiştir.`)
  }

  // HDD'ler — tüm cihazların diskleri birleşik: "Kayıt cihazında 2 adet 4 TB ve
  // 4 adet 8 TB kapasiteli disk bulunmaktadır."
  const hddToplam = {}
  cihazlar.forEach((k) => {
    Object.entries(k.hddler || {}).forEach(([kap, adet]) => {
      if (Number(adet) > 0) hddToplam[kap] = (hddToplam[kap] || 0) + Number(adet)
    })
  })
  const hddParca = Object.entries(hddToplam).map(([kap, adet]) => `${adet} adet ${kap}`)
  if (hddParca.length > 0) {
    p.push(`Kayıt cihazında ${hddParca.join(' ve ')} kapasiteli disk bulunmaktadır.`)
  }

  if (arizali > 0) {
    p.push('Arızalı kameralar için servis talebiniz oluşturulmuştur. En kısa süre içerisinde arızaya müdahale edilecektir.')
  } else if (c.saatTarih === 'guncel' || c.saatTarih === 'duzeltildi') {
    p.push('Yapılan bakım kontrollerinde herhangi bir arızalı kameraya rastlanmamıştır.')
  }

  return p.join(' ')
}

// Genel şablonlar — spec 9/10/11/12 metinleri; adet/marka enterpolasyonlu.
// c: { adet, marka, boyut (ekran), sonucDurum, arizaliAdet, aciklama }
export function genelSonucMetni(tip, c) {
  const adet = Number(c.adet) || 0
  const marka = (c.marka || '').trim()
  const p = []

  if (tip === 'turnike') {
    if (adet > 0) {
      p.push(`Lokasyonda bulunan ${adet} adet turnikenin aylık periyodik bakımları gerçekleştirilmiştir.`)
      if (c.sonucDurum === 'sorunsuz') p.push('Turnikelerin tamamının sorunsuz ve çalışır durumda olduğu kontrol edilmiştir.')
    } else {
      p.push('Lokasyonda bulunan turnikelerin aylık periyodik bakımları gerçekleştirilmiştir.')
      if (c.sonucDurum === 'sorunsuz') p.push('Turnike sistemi sorunsuz bir şekilde çalışmaktadır.')
    }
    if (c.sonucDurum === 'arizali') {
      p.push(`Yapılan kontrollerde ${Number(c.arizaliAdet) || ''} adet turnikede arıza tespit edilmiştir. Arızaya ilişkin servis talebiniz oluşturulmuştur. En kısa süre içerisinde arızaya müdahale edilecektir.`)
    }
  } else if (tip === 'ekran_led') {
    const boyut = (c.boyut || '').trim()
    const tanim = [marka && `${marka} marka`, boyut && `${boyut}`].filter(Boolean).join(' ')
    if (adet > 1) {
      p.push(`Lokasyonda bulunan ${adet} adet ${tanim ? tanim + ' ' : ''}tanıtım ekranının periyodik bakımları gerçekleştirilmiştir.`)
      if (c.sonucDurum === 'sorunsuz') p.push('Ekranların kablo bağlantıları kontrol edilmiş ve ekranlar çalışır durumda teslim edilmiştir.')
    } else {
      p.push(`Lokasyonda bulunan ${tanim ? tanim + ' ' : ''}tanıtım ekranının periyodik bakımı gerçekleştirilmiştir.`)
      if (c.sonucDurum === 'sorunsuz') p.push('Ekranın kablo bağlantıları kontrol edilmiş ve ekran çalışır durumda teslim edilmiştir.')
    }
    if (c.sonucDurum === 'arizali') {
      p.push('Yapılan kontrollerde ekranda arıza tespit edilmiştir. Arızaya ilişkin servis talebiniz oluşturulmuştur. En kısa süre içerisinde arızaya müdahale edilecektir.')
    }
  } else if (tip === 'hirsiz_alarm') {
    p.push('Lokasyonda bulunan hırsız alarm sisteminin periyodik bakımları gerçekleştirilmiştir. Sistem sabotaj testi uygulanarak devreye alınmıştır.')
    if (c.sonucDurum === 'sorunsuz') {
      p.push('Yapılan kontroller sonucunda herhangi bir problem tespit edilmemiştir. Hırsız alarm sistemi sorunsuz bir şekilde çalışmaktadır.')
    } else {
      p.push('Yapılan kontrollerde sistemde problem tespit edilmiştir. Arızaya ilişkin servis talebiniz oluşturulmuştur. En kısa süre içerisinde arızaya müdahale edilecektir.')
    }
  } else if (tip === 'sistem_odasi') {
    const m = marka || 'CANOVATE'
    p.push(`Sistem odasında bulunan ${m} marka duman ve nem sensörlerinin periyodik denetimi yapılmıştır.`)
    if (c.sonucDurum === 'sorunsuz') {
      p.push(`Sensör değerlerinin normal seviyede olduğu gözlemlenmiştir. Sistem odasında bulunan ${m} marka soğutma ünitelerinin periyodik denetimi yapılmıştır. Gaz miktarı, çıkış sıcaklığı ve oda içi nem değerlerinin normal seviyede olduğu gözlemlenmiştir. Dış ünitelerin iyi durumda olduğu tespit edilmiştir.`)
    } else {
      p.push('Yapılan denetimlerde olumsuz durum tespit edilmiştir. Konuya ilişkin servis talebiniz oluşturulmuştur. En kısa süre içerisinde müdahale edilecektir.')
    }
  } else if (tip === 'fiber') {
    p.push('Lokasyonda bulunan fiber altyapısının periyodik bakım kontrolleri gerçekleştirilmiştir.')
    if (c.sonucDurum === 'sorunsuz') {
      p.push('Yapılan kontrollerde herhangi bir problem tespit edilmemiştir. Fiber altyapısı sorunsuz bir şekilde çalışmaktadır.')
    } else {
      p.push('Yapılan kontrollerde problem tespit edilmiştir. Arızaya ilişkin servis talebiniz oluşturulmuştur. En kısa süre içerisinde arızaya müdahale edilecektir.')
    }
  }

  if ((c.aciklama || '').trim()) p.push((c.aciklama || '').trim())
  return p.join(' ')
}

export function sonucMetniUret(tip, cevaplar) {
  return tip === 'cctv' ? cctvSonucMetni(cevaplar) : genelSonucMetni(tip, cevaplar)
}
