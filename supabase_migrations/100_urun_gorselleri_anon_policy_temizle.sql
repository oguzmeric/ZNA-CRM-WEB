-- 100: urun-gorselleri bucket'ta eski anon-insert-select policy'sini kaldır
-- 097 sonrası hâlâ Advisor "Public Bucket Allows Listing" göstermişti;
-- suçlu Supabase Dashboard wizard'ından oluşmuş "anon-insert-select uhh1yv_0"
-- policy'siydi. urun_gorsel_authenticated_select (097) yeterli.

drop policy if exists "anon-insert-select uhh1yv_0" on storage.objects;
