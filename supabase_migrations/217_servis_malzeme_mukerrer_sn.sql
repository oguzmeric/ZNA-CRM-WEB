-- 217 — Aynı serviste aynı S/N iki kez KULLANILAN MALZEME olarak eklenemez.
--
-- İSTEK (2026-07-21): Servis detayında ürün seçerken "Kullanılan Malzeme"
-- birkaç kez eklenebiliyordu. İstemci tarafı engellendi (ServisMalzemeleriCard);
-- bu index veritabanı seviyesinde savunma (çift tık / eşzamanlı istek de düşemez).
--
-- Yalnız S/N'li satırlar (seri_no not null). Sarf/işçilik (seri_no null) serbest —
-- onlar zaten miktar bazlı, tek satırda toplanır. Veri kontrol edildi: mevcut
-- mükerrer S/N yok (2026-07-21).

create unique index if not exists servis_malzemeleri_servis_sn_uq
  on servis_malzemeleri (servis_id, seri_no)
  where seri_no is not null;

notify pgrst, 'reload schema';
select 'MIG 217 OK — servis_malzemeleri (servis_id, seri_no) unique' as sonuc;
