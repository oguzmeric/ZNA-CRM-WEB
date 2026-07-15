-- Zincirin son iki halkası (madde 13):
--   Görüşme → Teklif → Satış Sözleşmesi → SİPARİŞ → (tamamlanınca) MONTAJ SERVİSİ
--
-- Tespit edilen kopukluklar:
-- 1) siparisler.durum CHECK'i 'tamamlandi'yi kabul ediyor ama bu değeri SET eden
--    hiçbir kod yok — Siparişler'deki "Tamamlandı" sekmesi hep boş. Montaj
--    köprüsünün tetikleyicisi de burası olduğu için önce tamamlama gerekiyor.
-- 2) Sipariş ile servis talebi arasında bağ kolonu yok (keşifteki
--    kesifler.servis_talep_id muadili) — montaj servisi açılınca izlenemez.

-- ---------- 1. Sipariş tamamlama ----------
alter table siparisler add column if not exists tamamlanma_tarihi timestamptz;
alter table siparisler add column if not exists tamamlayan_id     bigint references kullanicilar(id) on delete set null;
alter table siparisler add column if not exists tamamlayan_ad     text;
-- Montaj servisi köprüsü (ileri bağ) — keşif deseni
alter table siparisler add column if not exists servis_talep_id   bigint;

comment on column siparisler.servis_talep_id is
  'Sipariş tamamlanınca açılan montaj servis talebi (servis_talepleri.id).';

-- ---------- 2. Servisten siparişe geri bağ ----------
alter table servis_talepleri add column if not exists siparis_id bigint;
create index if not exists idx_servis_talep_siparis on servis_talepleri(siparis_id);

comment on column servis_talepleri.siparis_id is
  'Bu servis talebini doğuran sipariş (siparisler.id) — montaj köprüsü.';

-- ---------- 3. Montaj sorumlusu yetkisi ----------
-- Desen: fatura_yetkilisi (mig 165). Sabit id yerine bayrak — kişi değişince
-- kod değişmesin. (Kodda FERDI_ID = 16 gömülüydü; Ferdi Kalkan aslında id 33.)
alter table kullanicilar
  add column if not exists montaj_sorumlusu boolean not null default false;

comment on column kullanicilar.montaj_sorumlusu is
  'Sipariş tamamlanınca açılan montaj servis talebi varsayılan olarak buna atanır.';

-- Ferdi Kalkan — Teknik Müdür
update kullanicilar set montaj_sorumlusu = true where id = 33;

notify pgrst, 'reload schema';
