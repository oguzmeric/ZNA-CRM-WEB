// Basılı belgelerde görünen ŞİRKET KÜNYESİ — tek kaynak.
//
// ⚠️ Neden var: firma adı / adres / iletişim üç ayrı çıktı dosyasında
// kopyalanmıştı (servisCikti/ServisFormu, BakimYazdir, mobil
// templates/servisFormuHtml). 12.08.2026'da Anadolunet adresi değişince
// hepsini tek tek bulmak gerekti — biri atlansa formların bir kısmı eski
// adresi basmaya devam ederdi. Artık web tarafındaki çıktılar buradan
// besleniyor; künye değişince TEK dosya güncellenir.
//
// ⚠️ Mobil AYRI repo (crm-mobile/src/templates/servisFormuHtml.js) — kod
// paylaşılamıyor. Künye değişikliğinde ORAYI DA güncelle.
//
// Görsel ayarlar (banner, yükseklik, renk) burada DEĞİL: her şablonun kendi
// sayfa düzeni var, oraya ait.

export const FIRMA_KUNYE = {
  zna: {
    firmaAdi: 'ZNA TEKNOLOJİ BİLİŞİM HİZMETLERİ SANAYİ VE TİCARET LİMİTED ŞİRKETİ',
    adres: 'İ.O.S.B. KERESTECİLER SANAYİ SİTESİ 3B BLOK KAT:3 NO:3 BAŞAKŞEHİR/İSTANBUL',
    iletisim: 'İLETİŞİM: (212) 549-9494 · FAX: (212) 671-7454',
  },
  anadolunet: {
    firmaAdi: 'ANADOLUNET DİJİTAL YAPI A.Ş.',
    // 12.08.2026 güncellendi (kullanıcı bildirimi)
    adres: 'ZİYA GÖKALP MAH. SÜLEYMAN DEMİREL BLV. THE OFFICE NO: 7 E İÇ KAPI NO: 136 BAŞAKŞEHİR/ İSTANBUL',
    iletisim: 'İLETİŞİM: (212) 549-9494 · FAX: (212) 671-7454',
  },
}
