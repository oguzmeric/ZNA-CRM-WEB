-- Muhammet Nayman ↔ Muhammet Emin Nayman gibi kısaltmalarda da eşleşme:
-- tam ad eşleşmezse ilk kelime + son kelime eşleşmesine düşer.

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
  gruplu as (
    select b.kim, count(*)::bigint as sayi
    from birlesim b
    where b.kim is not null and trim(b.kim) <> ''
    group by b.kim
  ),
  kullanici_norm as (
    select
      k.id, k.ad, k.foto_url, k.unvan, k.cep_telefon,
      upper(translate(k.ad, _asci, _asci_ozeti)) as norm_ad,
      upper(translate(split_part(k.ad, ' ', 1), _asci, _asci_ozeti)) as ilk,
      upper(translate(
        (string_to_array(k.ad, ' '))[array_length(string_to_array(k.ad, ' '), 1)],
        _asci, _asci_ozeti
      )) as son
    from kullanicilar k
    where k.rol = 'personel' or k.rol = 'admin'
  )
  select
    g.kim,
    g.sayi,
    matched.foto_url,
    coalesce(matched.unvan, 'Teknisyen') as unvan,
    matched.cep_telefon
  from gruplu g
  left join lateral (
    select k.foto_url, k.unvan, k.cep_telefon
    from kullanici_norm k
    where
      -- Tam eşleşme
      k.norm_ad = upper(translate(g.kim, _asci, _asci_ozeti))
      -- veya ilk+son kelime eşleşmesi
      or (
        k.ilk = upper(translate(split_part(g.kim, ' ', 1), _asci, _asci_ozeti))
        and k.son = upper(translate(
          (string_to_array(g.kim, ' '))[array_length(string_to_array(g.kim, ' '), 1)],
          _asci, _asci_ozeti
        ))
      )
    order by
      case when k.norm_ad = upper(translate(g.kim, _asci, _asci_ozeti)) then 0 else 1 end
    limit 1
  ) matched on true
  order by g.sayi desc, g.kim asc;
end;
$$;

grant execute on function skor_liderlik(date, date) to anon, authenticated;

notify pgrst, 'reload schema';
