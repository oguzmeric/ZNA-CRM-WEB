-- Skor RPC'sine teknisyen bilgilerini ekle — unvan, telefon (varsa foto).
-- Panel yarış değil, teknisyen bazlı performans ekranı: iletişim bilgisi de görünsün.

drop function if exists skor_liderlik(date, date);

create or replace function skor_liderlik(baslangic date, bitis date)
returns table (
  kim text,
  sayi bigint,
  foto_url text,
  unvan text,
  telefon text
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
  ),
  eslesme as (
    select
      b.kim,
      count(*)::bigint as sayi,
      (
        select k.foto_url from kullanicilar k
        where upper(translate(k.ad, 'İıĞğŞşÇçÖöÜü', 'IIGGSSCCOOUU')) =
              upper(translate(b.kim, 'İıĞğŞşÇçÖöÜü', 'IIGGSSCCOOUU'))
        limit 1
      ) as foto_url,
      (
        select k.unvan from kullanicilar k
        where upper(translate(k.ad, 'İıĞğŞşÇçÖöÜü', 'IIGGSSCCOOUU')) =
              upper(translate(b.kim, 'İıĞğŞşÇçÖöÜü', 'IIGGSSCCOOUU'))
        limit 1
      ) as unvan,
      (
        select k.cep_telefon from kullanicilar k
        where upper(translate(k.ad, 'İıĞğŞşÇçÖöÜü', 'IIGGSSCCOOUU')) =
              upper(translate(b.kim, 'İıĞğŞşÇçÖöÜü', 'IIGGSSCCOOUU'))
        limit 1
      ) as telefon
    from birlesim b
    where b.kim is not null and trim(b.kim) <> ''
    group by b.kim
  )
  select kim, sayi, foto_url, unvan, telefon
  from eslesme
  order by sayi desc, kim asc;
$$;

grant execute on function skor_liderlik(date, date) to anon, authenticated;

notify pgrst, 'reload schema';
