-- Firma/müşteri oluştururken girilen "Yetkili Kişi" (ad, soyad, telefon, email)
-- musteriler tablosunun kendi kolonlarına yazılıyordu. MusteriDetay'daki "Kişiler"
-- listesi ise yalnızca musteri_kisiler tablosundan okuyor → yetkili hiç görünmüyordu.
-- Kullanıcı görünmediği için kişiyi elle ikinci kez ekliyor; görüşme ekranı iki
-- kaynağı birleştirdiğinden orada kişi çift görünüyordu.
--
-- Çözüm (mig 160/161 ile aynı desen): tek kaynak DB'de birleşsin. musteriler'e
-- yazılan yetkili, musteri_kisiler'de ana kişi olarak yansısın. Web formu, hızlı
-- ekle modalı ve mobil — tüm yazma yolları tek trigger'la kapsanır.

-- Türkçe-duyarlı küçük harf. Postgres'in lower()'ı 'İ' (U+0130) için noktalı-i
-- (i + combining dot) üretir; bu yüzden lower('ZEKERİYA') <> lower('Zekeriya') olur
-- ve isim eşleştirmesi sessizce ıskalar (ilk denemede çift kişi kartı oluştu).
-- Önce İ→i, I→ı çevirisi yapıp sonra lower() uyguluyoruz.
create or replace function tr_kucuk(p text)
returns text
language sql
immutable
as $$
  select lower(translate(coalesce(p, ''), 'İI', 'iı'));
$$;

create or replace function musteri_ana_kisi_senkron()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ad      text := btrim(coalesce(new.ad, ''));
  v_soyad   text := btrim(coalesce(new.soyad, ''));
  v_tel     text := nullif(btrim(coalesce(new.telefon, '')), '');
  v_email   text := nullif(btrim(coalesce(new.email, '')), '');
  v_hedef   bigint;
begin
  -- Yetkili adı yoksa yapacak bir şey yok
  if v_ad = '' and v_soyad = '' then
    return new;
  end if;

  -- UPDATE'te yetkili adı değiştiyse: ESKİ ada karşılık gelen kişi kartını yeniden
  -- adlandır (yeni bir kopya oluşturma)
  if TG_OP = 'UPDATE'
     and (btrim(coalesce(old.ad, '')) <> v_ad or btrim(coalesce(old.soyad, '')) <> v_soyad)
     and (btrim(coalesce(old.ad, '')) <> '' or btrim(coalesce(old.soyad, '')) <> '')
  then
    select id into v_hedef
      from musteri_kisiler
     where musteri_id = new.id
       and tr_kucuk(btrim(coalesce(ad, ''))) = tr_kucuk(btrim(coalesce(old.ad, '')))
       and tr_kucuk(btrim(coalesce(soyad, ''))) = tr_kucuk(btrim(coalesce(old.soyad, '')))
     order by ana_kisi desc, id asc
     limit 1;

    if v_hedef is not null then
      update musteri_kisiler
         set ad      = v_ad,
             soyad   = v_soyad,
             telefon = coalesce(v_tel, telefon),
             email   = coalesce(v_email, email)
       where id = v_hedef;
      return new;
    end if;
  end if;

  -- Bu isimde kişi zaten var mı? (büyük/küçük harf duyarsız — kullanıcı elle
  -- eklediyse tekrar oluşturma)
  select id into v_hedef
    from musteri_kisiler
   where musteri_id = new.id
     and tr_kucuk(btrim(coalesce(ad, ''))) = tr_kucuk(v_ad)
     and tr_kucuk(btrim(coalesce(soyad, ''))) = tr_kucuk(v_soyad)
   order by ana_kisi desc, id asc
   limit 1;

  if v_hedef is null then
    insert into musteri_kisiler (musteri_id, ad, soyad, telefon, email, ana_kisi)
    values (
      new.id, v_ad, v_soyad, v_tel, v_email,
      not exists (select 1 from musteri_kisiler where musteri_id = new.id and ana_kisi)
    );
  else
    -- Mevcut kartta boş kalan iletişim alanlarını doldur; kullanıcının elle
    -- girdiği değerleri EZME
    update musteri_kisiler
       set telefon = coalesce(nullif(btrim(coalesce(telefon, '')), ''), v_tel),
           email   = coalesce(nullif(btrim(coalesce(email, '')), ''), v_email)
     where id = v_hedef;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_musteri_ana_kisi_senkron on musteriler;
create trigger trg_musteri_ana_kisi_senkron
  after insert or update of ad, soyad, telefon, email on musteriler
  for each row execute function musteri_ana_kisi_senkron();

-- Backfill: ad/soyad'ı dolu olup kişi kartı olmayan mevcut müşteriler
insert into musteri_kisiler (musteri_id, ad, soyad, telefon, email, ana_kisi)
select m.id,
       btrim(coalesce(m.ad, '')),
       btrim(coalesce(m.soyad, '')),
       nullif(btrim(coalesce(m.telefon, '')), ''),
       nullif(btrim(coalesce(m.email, '')), ''),
       not exists (select 1 from musteri_kisiler k2 where k2.musteri_id = m.id and k2.ana_kisi)
  from musteriler m
 where (btrim(coalesce(m.ad, '')) <> '' or btrim(coalesce(m.soyad, '')) <> '')
   and not exists (
     select 1 from musteri_kisiler k
      where k.musteri_id = m.id
        and tr_kucuk(btrim(coalesce(k.ad, ''))) = tr_kucuk(btrim(coalesce(m.ad, '')))
        and tr_kucuk(btrim(coalesce(k.soyad, ''))) = tr_kucuk(btrim(coalesce(m.soyad, '')))
   );

notify pgrst, 'reload schema';
