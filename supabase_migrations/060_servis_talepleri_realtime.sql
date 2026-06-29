-- servis_talepleri tablosunu supabase_realtime publication'a ekle.
-- Boylelikle bir kullanici atama/durum/diger alan guncellediginde diger
-- istemciler postgres_changes UPDATE event'i ile aninda goruyor.
-- Daha once kayitli olmadigi icin client'ta INSERT/UPDATE subscription'lar
-- yazilmis ama event hic ulasmiyordu; refresh zorunluydu.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'servis_talepleri'
  ) then
    execute 'alter publication supabase_realtime add table public.servis_talepleri';
  end if;
end $$;

-- UPDATE event'leri full row icermesi icin replica identity 'full' yapilir.
-- Bu sayede client UPDATE payload'inda butun kolonlari (atanan_kullanici_*,
-- durum_gecmisi vb.) eksiksiz alabilir.
alter table public.servis_talepleri replica identity full;

notify pgrst, 'reload schema';
