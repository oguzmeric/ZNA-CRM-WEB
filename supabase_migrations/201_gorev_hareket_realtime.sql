-- 201: gorev_hareketleri realtime publication'a eklenir — mobil görev detayı
-- canlı aboneliği hareket kapsüllerini de anlık alsın (gorevler + gorev_yorumlari zaten yayında).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'gorev_hareketleri'
  ) then
    alter publication supabase_realtime add table gorev_hareketleri;
  end if;
end $$;

select 'MIG 201 OK' as sonuc;
