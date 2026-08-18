// Sicil kartı alan tanımları — VERİ, bileşen değil.
//
// Neden böyle: özlük + istihdam toplam ~35 alan. Her biri için ayrı JSX yazmak
// hem 800 satır şişme hem de "bir alanda Label var öbüründe yok" tutarsızlığı
// demekti. Alanlar burada tanımlanır, AlanGorunum.jsx tek bir kalıptan basar.
//
// tip: 'metin' | 'cokSatir' | 'tarih' | 'sayi' | 'liste' | 'evet_hayir'
// liste tipinde: secenekler = ['A','B'] veya [{id, isim}]

import {
  DEPARTMANLAR, CINSIYETLER, MEDENI_DURUMLAR, KAN_GRUPLARI,
  OGRENIM_DURUMLARI, CALISMA_SEKILLERI, SOZLESME_TURLERI, ASKERLIK_DURUMLARI,
} from '../../services/personelSicilService'

/** Özlük sekmesi — kimlik, iletişim, eğitim, aile, banka */
export const OZLUK_GRUPLARI = [
  {
    baslik: 'Kimlik Bilgileri',
    alanlar: [
      { k: 'tcKimlik',    ad: 'T.C. Kimlik No', tip: 'metin', maxLength: 11, ipucu: '11 hane' },
      { k: 'dogumTarihi', ad: 'Doğum Tarihi',   tip: 'tarih' },
      { k: 'dogumYeri',   ad: 'Doğum Yeri',     tip: 'metin' },
      { k: 'cinsiyet',    ad: 'Cinsiyet',       tip: 'liste', secenekler: CINSIYETLER },
      { k: 'medeniDurum', ad: 'Medeni Durum',   tip: 'liste', secenekler: MEDENI_DURUMLAR },
      { k: 'uyruk',       ad: 'Uyruk',          tip: 'metin' },
      { k: 'kanGrubu',    ad: 'Kan Grubu',      tip: 'liste', secenekler: KAN_GRUPLARI },
      { k: 'babaAdi',     ad: 'Baba Adı',       tip: 'metin' },
      { k: 'anaAdi',      ad: 'Ana Adı',        tip: 'metin' },
    ],
  },
  {
    baslik: 'İletişim',
    alanlar: [
      { k: 'adres',      ad: 'Adres',        tip: 'cokSatir', genis: true },
      { k: 'il',         ad: 'İl',           tip: 'metin' },
      { k: 'ilce',       ad: 'İlçe',         tip: 'metin' },
      { k: 'evTelefon',  ad: 'Ev Telefonu',  tip: 'metin' },
    ],
  },
  {
    baslik: 'Acil Durumda Aranacak Kişi',
    alanlar: [
      { k: 'acilKisiAd',        ad: 'Ad Soyad',  tip: 'metin' },
      { k: 'acilKisiYakinlik',  ad: 'Yakınlık',  tip: 'metin', ipucu: 'eş / anne / kardeş…' },
      { k: 'acilKisiTelefon',   ad: 'Telefon',   tip: 'metin' },
    ],
  },
  {
    baslik: 'Eğitim',
    alanlar: [
      { k: 'ogrenimDurumu', ad: 'Öğrenim Durumu', tip: 'liste', secenekler: OGRENIM_DURUMLARI },
      { k: 'mezunOkul',     ad: 'Mezun Olduğu Okul', tip: 'metin' },
      { k: 'bolum',         ad: 'Bölüm',          tip: 'metin' },
      { k: 'mezuniyetYili', ad: 'Mezuniyet Yılı', tip: 'sayi' },
    ],
  },
  {
    baslik: 'Aile',
    aciklama: 'Asgari geçim indirimi hesabında kullanılır.',
    alanlar: [
      { k: 'esCalisiyor', ad: 'Eşi Çalışıyor mu', tip: 'evet_hayir' },
      { k: 'cocukSayisi', ad: 'Çocuk Sayısı',     tip: 'sayi' },
    ],
  },
  {
    baslik: 'Banka',
    alanlar: [
      { k: 'iban',     ad: 'IBAN',      tip: 'metin', genis: true, ipucu: 'TR ile başlar' },
      { k: 'bankaAdi', ad: 'Banka Adı', tip: 'metin' },
    ],
  },
]

/** İstihdam sekmesi — işe giriş, sözleşme, SGK */
export const ISTIHDAM_GRUPLARI = [
  {
    baslik: 'İstihdam',
    alanlar: [
      { k: 'iseGirisTarihi',   ad: 'İşe Giriş Tarihi', tip: 'tarih',
        ipucu: 'Kıdem ve yıllık izin hakedişi bu tarihten hesaplanır.' },
      { k: 'departman',        ad: 'Departman',        tip: 'liste', secenekler: DEPARTMANLAR },
      { k: 'calismaSekli',     ad: 'Çalışma Şekli',    tip: 'liste', secenekler: CALISMA_SEKILLERI },
      { k: 'sozlesmeTuru',     ad: 'Sözleşme Türü',    tip: 'liste', secenekler: SOZLESME_TURLERI },
      { k: 'calismaYeri',      ad: 'Çalışma Yeri',     tip: 'metin', ipucu: 'merkez / şube / saha' },
      { k: 'yoneticiId',       ad: 'Bağlı Olduğu Yönetici', tip: 'liste', secenekler: [], dinamik: 'yoneticiler' },
    ],
  },
  {
    baslik: 'SGK ve Resmi Bilgiler',
    alanlar: [
      { k: 'sgkSicilNo',       ad: 'SGK Sicil No',        tip: 'metin' },
      { k: 'sigortaBaslangic', ad: 'Sigorta Başlangıcı',  tip: 'tarih' },
      { k: 'meslekKodu',       ad: 'Meslek Kodu',         tip: 'metin' },
      { k: 'engellilikOrani',  ad: 'Engellilik Oranı (%)', tip: 'sayi' },
      { k: 'askerlikDurumu',   ad: 'Askerlik Durumu',     tip: 'liste', secenekler: ASKERLIK_DURUMLARI },
    ],
  },
  {
    baslik: 'İşten Ayrılış',
    aciklama: 'Yalnız işten ayrılan personel için doldurulur.',
    alanlar: [
      { k: 'istenCikisTarihi', ad: 'İşten Çıkış Tarihi', tip: 'tarih' },
      { k: 'cikisNedeni',      ad: 'Çıkış Nedeni',       tip: 'cokSatir', genis: true },
    ],
  },
  {
    baslik: 'Not',
    alanlar: [
      { k: 'notlar', ad: 'Sicil Notu', tip: 'cokSatir', genis: true },
    ],
  },
]

/** Tüm alan anahtarları — form state'i başlatmak için. */
export const TUM_ALANLAR = [...OZLUK_GRUPLARI, ...ISTIHDAM_GRUPLARI]
  .flatMap(g => g.alanlar.map(a => a.k))
