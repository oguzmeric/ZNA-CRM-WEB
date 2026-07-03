-- Skor leaderboard için anon erişimli SECURITY DEFINER RPC.
-- İki kaynaktan (servis_talepleri + servis_raporlari) verilen aralıktaki
-- kayıtları teknisyen adı bazında birleştirir, kullanicilar tablosundan
-- foto url'i (varsa) getirir. RLS bypass ama sadece agregat bilgi döner —
-- kayıt detayı sızmaz.

create or replace function skor_liderlik(baslangic date, bitis date)
returns table (
  kim text,
  sayi bigint,
  foto_url text
)
language sql
security definer
set search_path = public
as $$
  with birlesim as (
    select atanan_kullanici_ad as kim
    from servis_talepleri
    where durum = 'tamamlandi'
      and tamamlanma_tarihi is not null
      and tamamlanma_tarihi::date between baslangic and bitis
      and atanan_kullanici_ad is not null
    union all
    select teknisyen as kim
    from servis_raporlari
    where gid_tarih between baslangic and bitis
      and teknisyen is not null
  )
  select
    b.kim,
    count(*)::bigint as sayi,
    (
      select k.foto_url
      from kullanicilar k
      where upper(translate(k.ad, 'İıĞğŞşÇçÖöÜü', 'IIGGSSCCOOUU')) =
            upper(translate(b.kim, 'İıĞğŞşÇçÖöÜü', 'IIGGSSCCOOUU'))
      limit 1
    ) as foto_url
  from birlesim b
  where b.kim is not null and trim(b.kim) <> ''
  group by b.kim
  order by sayi desc, kim asc;
$$;

grant execute on function skor_liderlik(date, date) to anon, authenticated;

notify pgrst, 'reload schema';
