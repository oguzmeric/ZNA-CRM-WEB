-- Skor metric değişikliği: aynı fiş yerine "teknisyen × gün × firma" unique.
-- Bir teknisyen bir günde bir firmaya kaç fiş açarsa açsın 1 servis sayılır.
-- Böylece esnweb'den gelen "her cihaz için ayrı fiş" spam'i şişirmez.

drop function if exists skor_liderlik(date, date);

create or replace function skor_liderlik(baslangic date, bitis date)
returns table (
  kim text,
  sayi bigint,
  foto_url text,
  unvan text,
  telefon text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  _asci text := 'İıĞğŞşÇçÖöÜü';
  _asci_ozeti text := 'IIGGSSCCOOUU';
begin
  return query
  with birlesim as (
    select
      atanan_kullanici_ad as tek_ad,
      tamamlanma_tarihi::date as tarih,
      coalesce(firma_adi, '(bilinmiyor)') as firma
    from servis_talepleri
    where durum = 'tamamlandi'
      and tamamlanma_tarihi is not null
      and tamamlanma_tarihi::date between baslangic and bitis
      and atanan_kullanici_ad is not null
    union all
    select
      teknisyen as tek_ad,
      gid_tarih as tarih,
      coalesce(firma_adi, '(bilinmiyor)') as firma
    from servis_raporlari
    where gid_tarih between baslangic and bitis
      and teknisyen is not null
  ),
  teklestirilmis as (
    select distinct tek_ad, tarih, firma
    from birlesim
    where tek_ad is not null and trim(tek_ad) <> ''
  ),
  gruplu as (
    select tek_ad, count(*)::bigint as tek_sayi
    from teklestirilmis
    group by tek_ad
  ),
  kullanici_norm as (
    select
      k.foto_url as k_foto,
      k.unvan as k_unvan,
      k.cep_telefon as k_tel,
      upper(translate(k.ad, _asci, _asci_ozeti)) as norm_ad,
      upper(translate(split_part(k.ad, ' ', 1), _asci, _asci_ozeti)) as ilk,
      upper(translate(
        (string_to_array(k.ad, ' '))[array_length(string_to_array(k.ad, ' '), 1)],
        _asci, _asci_ozeti
      )) as son
    from kullanicilar k
    where k.rol in ('personel', 'admin')
  )
  select
    g.tek_ad,
    g.tek_sayi,
    matched.k_foto,
    coalesce(matched.k_unvan, 'Teknisyen'),
    matched.k_tel
  from gruplu g
  left join lateral (
    select k.k_foto, k.k_unvan, k.k_tel
    from kullanici_norm k
    where
      k.norm_ad = upper(translate(g.tek_ad, _asci, _asci_ozeti))
      or (
        k.ilk = upper(translate(split_part(g.tek_ad, ' ', 1), _asci, _asci_ozeti))
        and k.son = upper(translate(
          (string_to_array(g.tek_ad, ' '))[array_length(string_to_array(g.tek_ad, ' '), 1)],
          _asci, _asci_ozeti
        ))
      )
    order by
      case when k.norm_ad = upper(translate(g.tek_ad, _asci, _asci_ozeti)) then 0 else 1 end
    limit 1
  ) matched on true
  order by g.tek_sayi desc, g.tek_ad asc;
end;
$$;

grant execute on function skor_liderlik(date, date) to anon, authenticated;

notify pgrst, 'reload schema';
