-- 250 — Grup sohbeti canlı gelmiyordu: sohbet_katilimcilar realtime'a alındı
--
-- BULGU (kanıtlandı, 31.07): supabase_realtime publication'ında sohbet
-- tarafından YALNIZ `mesajlar` vardı. Oysa src/context/ChatContext.jsx
-- "bir gruba eklendiğimde/çıkarıldığımda sohbet listesi tazelensin" diye
-- sohbet_katilimcilar'a abone oluyor — o abonelik HİÇ tetiklenmiyordu.
--
-- Kırılan zincir:
--   yeni gruba eklendin → sohbet_katilimcilar INSERT → (olay gelmiyor)
--   → sohbetleriYenile() çağrılmıyor → grupIdAnahtar değişmiyor
--   → o grubun mesaj kanalı hiç kurulmuyor
--   → grup mesajları sayfa YENİLENENE KADAR ne pencereye ne rozete düşüyor.
--
-- REPLICA IDENTITY FULL şart: abonelik filtresi `kullanici_id=eq.<id>`.
-- Varsayılan (primary key) kimlikte DELETE olayının eski satırı yalnız PK
-- taşır, kullanici_id gelmez → gruptan ÇIKARILMA olayı filtreye takılmaz.
--
-- Not: `sohbetler` tablosu bilerek eklenmedi — kodda onu dinleyen abonelik
-- yok, gereksiz realtime yükü olurdu. İhtiyaç olursa ayrı migration.

begin;

alter table public.sohbet_katilimcilar replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'sohbet_katilimcilar'
  ) then
    alter publication supabase_realtime add table public.sohbet_katilimcilar;
  end if;
end $$;

commit;
