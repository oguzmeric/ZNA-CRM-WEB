-- 150: musteri_cihazlari realtime — telefonda SN okutulup kayıt/arıza girilince
-- web MusteriDetay'daki "Müşteri Cihazları" bölümü anlık güncellensin.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'musteri_cihazlari'
  ) then
    execute 'alter publication supabase_realtime add table public.musteri_cihazlari';
  end if;
end $$;

notify pgrst, 'reload schema';
