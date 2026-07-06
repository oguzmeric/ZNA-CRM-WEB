-- 100: urun-gorselleri bucket'ta Dashboard wizard'ından kalıntı anon policy'ler
-- 097 sonrası hâlâ Advisor uyarı verdi; suçlu iki policy:
--   1) "anon-insert-select uhh1yv_0" — anon SELECT (listing)
--   2) "anon upload urun-gorselleri" — anon INSERT (upload!)
-- Personel policy'leri (urun_gorsel_staff_*) yeterli, bunlar tamamen kaldırılabilir.

drop policy if exists "anon-insert-select uhh1yv_0" on storage.objects;
drop policy if exists "anon upload urun-gorselleri" on storage.objects;
