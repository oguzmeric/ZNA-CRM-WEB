-- "Müşteri açtı mı?" rozeti — musteri_paylasim_linkleri RLS'i sadece oluşturana
-- select verir; ekipteki herkes gönderim/açılma durumunu görebilsin ama token
-- SIZMASIN diye istatistik-only SECURITY DEFINER RPC (token kolonu dönmez).

create or replace function paylasim_durum_ozet(in_belge_tipi text, in_belge_id bigint)
returns table (
  gonderim_tarihi timestamptz,
  gonderim_kanali text,
  ilk_acilma      timestamptz,
  son_acilma      timestamptz,
  acilma_sayisi   integer,
  link_sayisi     integer
)
language sql
security definer
set search_path = public
stable
as $$
  select
    max(mp.olusturma_tarih),
    (array_agg(mp.gonderim_kanali order by mp.olusturma_tarih desc))[1],
    min(mp.ilk_acilma),
    max(mp.son_acilma),
    coalesce(sum(mp.acilma_sayisi), 0)::int,
    count(*)::int
  from musteri_paylasim_linkleri mp
  where mp.belge_tipi = in_belge_tipi
    and mp.belge_id   = in_belge_id
    and not mp.iptal_edildi
  having count(*) > 0;
$$;

-- Migration 098 politikası: SECURITY DEFINER fonksiyonlara anon erişemez.
revoke execute on function paylasim_durum_ozet(text, bigint) from public, anon;
grant execute on function paylasim_durum_ozet(text, bigint) to authenticated, service_role;

notify pgrst, 'reload schema';
