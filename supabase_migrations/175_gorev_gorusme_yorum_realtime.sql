-- 175 — Görevler / Görüşmeler / Görev Yorumları realtime publication'a
-- Telefondan girilen görüşme/görev/yorum web'de anında (websocket) görünsün.
-- Web sayfaları postgres_changes ile abone olur (Gorevler, Gorusmeler, GorevDetay).

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='gorevler') then
    alter publication supabase_realtime add table gorevler;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='gorusmeler') then
    alter publication supabase_realtime add table gorusmeler;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='gorev_yorumlari') then
    alter publication supabase_realtime add table gorev_yorumlari;
  end if;
end $$;

-- Not: realtime sadece RLS SELECT'i geçen satırları yayınlar. gorevler ve
-- gorev_yorumlari SELECT'i mig 174 ile is_staff() (herkes); gorusmeler SELECT'i
-- de is_staff() olmalı ki tüm personel canlı görsün — kontrol edip gerekiyorsa
-- açalım (aşağıdaki blok yalnızca daraltılmışsa genişletir).
