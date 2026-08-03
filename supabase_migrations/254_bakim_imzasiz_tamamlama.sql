-- 254 — Müşteri yetkilisi yokken bakımı tamamlayabilme (gerekçeli imzasızlık)
--
-- Spec madde 26 iki imzayı da şart koşuyordu; sahada yetkili bulunmadığında iş
-- askıda kalıyordu. İmzayı ATLAMIYORUZ — yerine "kim, ne zaman, neden" kaydı
-- geçiyor. Müşteri sonradan imzalayabilsin diye imza kolonları serbest kalır:
-- imza gelirse rapordaki şerh düşer, gerekçe kaydı tarihçe olarak durur.
--
-- Kolonlar bilinçli NULLABLE — "imzasız" istisnai durum, varsayılan değil.
-- (alis_fiyat dersi: not null default ile "girilmedi" hâli yok edilmemeli.)

alter table public.toplu_bakimlar
  add column if not exists musteri_imza_yok_sebep text,
  add column if not exists musteri_imza_yok_not text,
  add column if not exists musteri_imza_yok_tarih timestamptz,
  add column if not exists musteri_imza_yok_kullanici_id bigint references public.kullanicilar(id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.toplu_bakimlar'::regclass
      and conname = 'toplu_bakimlar_imza_yok_sebep_check'
  ) then
    alter table public.toplu_bakimlar
      add constraint toplu_bakimlar_imza_yok_sebep_check
      check (musteri_imza_yok_sebep is null or musteri_imza_yok_sebep in (
        'yetkili_yok', 'lokasyon_kapali', 'yetkili_imzalamadi', 'mesai_disi', 'diger'
      ));
  end if;
end $$;

comment on column public.toplu_bakimlar.musteri_imza_yok_sebep is
  'Müşteri imzası alınamadıysa gerekçe kodu. Dolu + musteri_imza_url boş = raporda şerh.';

-- Kim imzasız tamamladı? Denetim için doldurulur; istemci yazamasın diye trigger.
create or replace function public.bakim_imza_yok_damga()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_kul bigint;
begin
  -- Gerekçe YENİ konduğunda damgala
  if new.musteri_imza_yok_sebep is not null
     and (tg_op = 'INSERT' or old.musteri_imza_yok_sebep is null) then
    select id into v_kul from kullanicilar where auth_id = auth.uid() limit 1;
    new.musteri_imza_yok_kullanici_id := coalesce(v_kul, new.musteri_imza_yok_kullanici_id);
    new.musteri_imza_yok_tarih := coalesce(new.musteri_imza_yok_tarih, now());
  end if;
  -- Gerekçe temizlenirse damgalar da düşsün (yanlış işaretleme geri alınabilir)
  if new.musteri_imza_yok_sebep is null then
    new.musteri_imza_yok_tarih := null;
    new.musteri_imza_yok_kullanici_id := null;
    new.musteri_imza_yok_not := null;
  end if;
  return new;
end $$;

drop trigger if exists tr_bakim_imza_yok_damga on public.toplu_bakimlar;
create trigger tr_bakim_imza_yok_damga
  before insert or update on public.toplu_bakimlar
  for each row execute function public.bakim_imza_yok_damga();
