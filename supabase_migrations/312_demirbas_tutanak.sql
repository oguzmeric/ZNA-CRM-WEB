-- 312 — Personel demirbaş teslim tutanağı
--
-- Sorun: demirbas_zimmet saha aletleri için tasarlanmıştı (kategori + serbest
-- açıklama). Bilgisayar/telefon teslim tutanağı için SERİ NUMARASI şart, ayrıca
-- marka/model ayrı kolonda olmalı ki tutanakta sütun hâline gelsin.
--
-- Tutanak AYRI TABLO DEĞİL: aynı anda teslim edilen kalemler aynı `tutanak_no`
-- değerini alır. Tutanak = o numaraya sahip satırların kümesi. Ara tablo ve
-- senkron derdi olmadan çalışır, kalem iade edilince tutanaktan düşmez
-- (tutanak tarihsel bir belgedir, sonradan değişmemeli).
--
-- ⚠️ Numaralar TRIGGER'da üretilir, istemcide DEĞİL — istemci sayacı yarış
-- yaratır (bkz. reference_belge_no_trigger).

-- ── 1) Yeni kolonlar ──────────────────────────────────────────────
alter table public.demirbas_zimmet
  add column if not exists marka        text,
  add column if not exists model        text,
  add column if not exists seri_no      text,
  add column if not exists demirbas_no  text,
  add column if not exists tutanak_no   text,
  add column if not exists teslim_notu  text;

comment on column public.demirbas_zimmet.demirbas_no is 'Envanter no — DBS-YYYY-NNNN, trigger üretir';
comment on column public.demirbas_zimmet.tutanak_no  is 'TTN-YYYY-NNNN — aynı teslimdeki kalemler aynı numarayı paylaşır';

create unique index if not exists demirbas_zimmet_demirbas_no_key
  on public.demirbas_zimmet (demirbas_no) where demirbas_no is not null;
create index if not exists demirbas_zimmet_tutanak_no_idx
  on public.demirbas_zimmet (tutanak_no) where tutanak_no is not null;
create index if not exists demirbas_zimmet_seri_no_idx
  on public.demirbas_zimmet (seri_no) where seri_no is not null;

-- ── 2) Envanter numarası trigger'ı ────────────────────────────────
-- Advisory lock: aynı saniyede iki kayıt açılırsa ikisi de aynı numarayı
-- almasın. Kilit işlem sonunda kendiliğinden düşer.
create or replace function public.demirbas_no_uret()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_yil  text := to_char(now() at time zone 'Europe/Istanbul', 'YYYY');
  v_sira int;
begin
  if new.demirbas_no is null or new.demirbas_no = '' then
    perform pg_advisory_xact_lock(hashtext('demirbas_no_' || v_yil));
    select coalesce(max(nullif(substring(demirbas_no from 10), '')::int), 0) + 1
      into v_sira
      from public.demirbas_zimmet
     where demirbas_no like 'DBS-' || v_yil || '-%';
    new.demirbas_no := 'DBS-' || v_yil || '-' || lpad(v_sira::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists tr_demirbas_no on public.demirbas_zimmet;
create trigger tr_demirbas_no
  before insert on public.demirbas_zimmet
  for each row execute function public.demirbas_no_uret();

-- ── 3) Tutanak oluşturma RPC'si ───────────────────────────────────
-- Seçilen kalemlere TEK bir tutanak numarası yazar ve numarayı döner.
-- Zaten tutanağa bağlı kalem varsa dokunmaz (belge sonradan değişmemeli).
create or replace function public.demirbas_tutanak_olustur(p_ids uuid[])
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_yil text := to_char(now() at time zone 'Europe/Istanbul', 'YYYY');
  v_sira int;
  v_no   text;
  v_adet int;
begin
  if not public.demirbas_yetkili() then
    raise exception 'Tutanak oluşturma yetkiniz yok.';
  end if;
  if p_ids is null or array_length(p_ids, 1) is null then
    raise exception 'Tutanağa en az bir demirbaş seçilmeli.';
  end if;

  perform pg_advisory_xact_lock(hashtext('demirbas_tutanak_' || v_yil));
  select coalesce(max(nullif(substring(tutanak_no from 10), '')::int), 0) + 1
    into v_sira
    from public.demirbas_zimmet
   where tutanak_no like 'TTN-' || v_yil || '-%';
  v_no := 'TTN-' || v_yil || '-' || lpad(v_sira::text, 4, '0');

  update public.demirbas_zimmet
     set tutanak_no = v_no
   where id = any(p_ids)
     and tutanak_no is null;
  get diagnostics v_adet = row_count;

  if v_adet = 0 then
    raise exception 'Seçilen kalemler zaten bir tutanağa bağlı.';
  end if;
  return v_no;
end;
$$;

grant execute on function public.demirbas_tutanak_olustur(uuid[]) to authenticated;

-- ── 4) İK yönetimi demirbaşları görebilsin ────────────────────────
-- Ölçüm (18.08): Abdullah demirbas_zimmet'te 0/162 satır görüyordu; politika
-- `kullanici_id = kendisi OR demirbas_yetkili()` diyor ve fonksiyon yalnız
-- admin + demirbas_yetkilisi bayrağını kapsıyordu. Personel Sicil kartındaki
-- zimmet sekmesi bu yüzden boş kalıyordu.
create or replace function public.demirbas_yetkili()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
      from public.kullanicilar k
     where k.auth_id = auth.uid()
       and coalesce(k.hesap_silindi, false) = false
       and (
            k.rol = 'admin'
         or coalesce(k.demirbas_yetkilisi, false)
         or (coalesce(k.tip,'') = 'zna' and 'ik_yonetim' = any(coalesce(k.moduller, '{}')))
       )
  );
$$;

-- ── 5) Kategori listesi ───────────────────────────────────────────
-- Mevcut check yalnız (laptop, canta, alet, telefon, diger) kabul ediyordu;
-- 'bilgisayar' insert'i 23514 ile düşüyordu. Masaüstü bilgisayar teslimi bu
-- modülün asıl kullanım sebebi olduğu için listeye eklendi. 'canta' korunuyor
-- (mevcut kayıtlar kullanıyor olabilir).
alter table public.demirbas_zimmet
  drop constraint if exists demirbas_zimmet_kategori_check;
alter table public.demirbas_zimmet
  add constraint demirbas_zimmet_kategori_check
  check (kategori = any (array['bilgisayar','laptop','canta','alet','telefon','diger']));
