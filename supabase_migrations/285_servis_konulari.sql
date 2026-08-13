-- 285 — Servis konu başlıkları SABİT LİSTE (13.08.2026, kullanıcı isteği)
--
-- SORUN: Servis talebinin "Konu / Başlık" alanı üç yerden de (web, müşteri
-- portalı, mobil) SERBEST METİN giriliyordu. Talep onaylanınca
-- `servis_onay_rapora_yaz` köprüsü konuyu servis_raporlari.ariza_kodu'na
-- kopyalıyor — raporlarda "İMAR MÜDÜRLÜĞÜ ARIZALI TELEFON VE YENİ..." gibi
-- upuzun açıklamalar kolon başlığı olarak birikiyordu ve kategorize etmek
-- imkânsızdı ("Denemee", "Görüşme: CCTV", firma adı yazılanlar...).
--
-- ÖLÇÜM: 12.395 raporun %93'ü eski esnweb standardındaki 7 kodda; kirlilik
-- son dönem CRM kayıtlarından (90 günde ~25 farklı serbest değer).
--
-- KARARLAR (kullanıcı, 13.08):
--   • Liste DB'de, admin yönetir (ekle + pasife al). Şirketin dosya arşiv
--     klasörleriyle birebir aynı 13 başlıkla açılır.
--   • Serbest metin TAMAMEN kapanır — detay zaten Açıklama alanında.
--   • Müşteri portalı da aynı listeden seçer.
--   • Eski 12.395 rapora DOKUNULMAZ; başlık adı sonradan değişse bile eski
--     kayıtlar o günkü metniyle kalır (konu rapora metin olarak kopyalanıyor —
--     bu bilinçli: tarihsel kayıt geriye dönük değişmez).

create table if not exists public.servis_konulari (
  id bigint generated always as identity primary key,
  ad text not null,
  sira integer not null default 100,
  aktif boolean not null default true,
  olusturma_tarih timestamptz not null default now(),
  olusturan_id bigint
);

-- Aynı ad iki kez eklenemesin (Türkçe büyük/küçük farkı dahil — TR'de lower()
-- İ/I'yı doğru katlamaz ama upper'lı unique pratik olarak yeterli: girişler
-- zaten tek elden, admin ekranından yapılıyor)
create unique index if not exists servis_konulari_ad_uq
  on public.servis_konulari (upper(ad));

comment on table public.servis_konulari is
  'Servis talebi konu başlıkları — sabit liste (mig 285). Silme YOK, pasife alma var: eski raporlar başlığa metinle bağlı.';

-- RLS: herkes (müşteri portal kullanıcıları DAHİL) okur, yalnız admin yazar.
-- Portal kullanıcısı talep açarken listeyi görmek zorunda — is_staff() kapısı
-- koyulursa portalda boş dropdown kalır.
alter table public.servis_konulari enable row level security;

drop policy if exists servis_konulari_okuma on public.servis_konulari;
create policy servis_konulari_okuma on public.servis_konulari
  for select to authenticated using (true);

drop policy if exists servis_konulari_yazma on public.servis_konulari;
create policy servis_konulari_yazma on public.servis_konulari
  for all to authenticated
  using ((select is_admin()))
  with check ((select is_admin()));

-- Seed: şirketin arşiv klasörleriyle birebir aynı 13 başlık.
-- `sira` klasör düzenindeki alfabetik sırayı korur.
insert into public.servis_konulari (ad, sira)
values
  ('ALARM SİSTEMLERİ', 10),
  ('CCTV BAKIM',       20),
  ('CCTV SERVİS',      30),
  ('DEVRİYE',          40),
  ('EKRAN BAKIMLARI',  50),
  ('FİBER',            60),
  ('GEÇİŞ KONTROL',    70),
  ('KARTLI GEÇİŞ',     80),
  ('KEŞİF',            90),
  ('PDKS',            100),
  ('PLAKA TANIMA',    110),
  ('SİSTEM ODALARI',  120),
  ('TELEFON SANTRAL', 130)
on conflict do nothing;
