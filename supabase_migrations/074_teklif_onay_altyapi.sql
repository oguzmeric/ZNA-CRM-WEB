-- Teklif Onay altyapisi (Aşama 1)
-- Hiyerarşi: Müşteri kabul → hazırlayan onaya gönder → Teklif Onay Yetkilisi onaylar → Sipariş Onay Yetkilisi onaylar.

-- Kullanıcı yetkileri
alter table kullanicilar
  add column if not exists teklif_onay_yetkilisi   boolean default false,
  add column if not exists teklif_onay_ust_yetkili boolean default false;

comment on column kullanicilar.teklif_onay_yetkilisi is 'Bu kullanıcı teklif onaylarını verebilir (Teklif Onayı sayfası).';
comment on column kullanicilar.teklif_onay_ust_yetkili is 'Bu kullanıcı gerekçe zorunluluğu olmadan teklif onayı verebilir.';

-- Teklif tablosuna onay JSONB alanı
alter table teklifler
  add column if not exists teklif_onayi jsonb;

-- Örnek JSONB şeması:
-- {
--   "durum": "bekliyor" | "onayli" | "reddedildi",
--   "gonderen_id": 1, "gonderen_ad": "SALİH ÇAKMAKLI", "gonderme_tarih": "2026-07-04T12:00:00Z",
--   "onaylayan_id": 2, "onaylayan_ad": "OĞUZ MERİÇ", "onay_tarih": "2026-07-04T14:00:00Z",
--   "onay_gerekcesi": "Fiyat uygun.",
--   "onaylayan_imza": "data:image/png;base64,...",
--   "red_nedeni": null
-- }

comment on column teklifler.teklif_onayi is 'Teklif onay akışı JSONB: durum, gönderen, onaylayan, tarih, gerekçe, imza, red_nedeni.';

notify pgrst, 'reload schema';
