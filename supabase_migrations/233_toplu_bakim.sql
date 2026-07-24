-- 233_toplu_bakim.sql
-- Toplu Bakım Operasyonu — DB temeli (F1).
-- Kural: bir müşteri + bir lokasyon + bir saha ziyareti = bir toplu bakım iş emri.
-- Ana kayıt TB-YYYY-NNNNN; altında saha sorumlusunun seçtiği bakım kalemleri
-- (TB-YYYY-NNNNN-CCTV gibi alt numaralarla). Seçilmeyen kalem için kayıt YOK.
--
-- Dersler uygulanmıştır:
--  * Belge no üretimi DB trigger + SECURITY DEFINER + advisory lock
--    (reference_belge_no_trigger — Sadık vakası 2026-07-24)
--  * RLS'te fonksiyonlar (select fn()) ile initplan
--    (reference_rls_initplan_performans)

begin;

-- ---------------------------------------------------------------------------
-- 1) Saha sorumlusu yetkisi — admin + bayraklı kişiler (Ferdi 33, Salih 34,
--    Mahmut 45). Demirbaş yetkisi deseniyle aynı (mig 226).
-- ---------------------------------------------------------------------------
alter table public.kullanicilar
  add column if not exists saha_sorumlusu boolean not null default false;

update public.kullanicilar set saha_sorumlusu = true where id in (33, 34, 45);

create or replace function public.saha_sorumlusu_mu()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from kullanicilar k
     where k.auth_id = auth.uid()
       and (k.rol = 'admin' or k.saha_sorumlusu = true)
  );
$$;
revoke all on function public.saha_sorumlusu_mu() from public;
revoke all on function public.saha_sorumlusu_mu() from anon;
grant execute on function public.saha_sorumlusu_mu() to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Lokasyonda fiziksel olarak BULUNAN sistemler (madde 4) —
--    ziyarette seçilen kalemlerden AYRI bilgi.
-- ---------------------------------------------------------------------------
alter table public.musteri_lokasyonlari
  add column if not exists bulunan_sistemler text[] default '{}';

-- ---------------------------------------------------------------------------
-- 3) Ana tablo — toplu_bakimlar
-- ---------------------------------------------------------------------------
create table if not exists public.toplu_bakimlar (
  id                    bigint generated always as identity primary key,
  tb_no                 text unique,                    -- TB-YYYY-NNNNN (trigger)
  musteri_id            bigint not null references public.musteriler(id),
  lokasyon_id           bigint references public.musteri_lokasyonlari(id) on delete set null,
  lokasyon_adi          text,                           -- lokasyon silinse de iz kalsın
  lokasyon_adres        text,
  sozlesme_id           bigint references public.sozlesmeler(id) on delete set null,
  bakim_donemi          text,                           -- '2026 - Temmuz' vb.
  planlanan_tarih       date,
  planlanan_saat        text,                           -- 'HH:MM'
  teknik_personel_id    bigint references public.kullanicilar(id) on delete set null,
  ekip_ids              bigint[] default '{}',          -- yardımcı teknik personeller
  musteri_yetkili_ad    text,
  musteri_yetkili_gorev text,
  musteri_yetkili_tel   text,
  aciklama              text,                           -- saha sorumlusu açıklaması
  oncelik               text not null default 'normal', -- dusuk|normal|yuksek|acil
  -- Durum akışı (madde 27):
  -- planlandi|atandi|yola_cikildi|lokasyona_ulasildi|bakim_basladi|devam_ediyor|
  -- eksik_bakim|imza_bekleniyor|tamamlandi|yonetici_kontrolunde|musteriye_gonderildi|iptal
  durum                 text not null default 'planlandi',
  iptal_sebebi          text,
  -- Saha zaman damgaları (teknik personel butonları — sistem otomatik yazar):
  yola_cikis_tarih      timestamptz,
  ulasma_tarih          timestamptz,
  baslama_tarih         timestamptz,
  bitis_tarih           timestamptz,
  -- İmzalar (tek müşteri imzası TÜM alt formlara uygulanır — madde 21-22):
  musteri_imza_url      text,
  musteri_imza_tarih    timestamptz,
  personel_imza_url     text,
  personel_imza_tarih   timestamptz,
  -- Belgeler:
  birlesik_rapor_url    text,
  olusturan_id          bigint references public.kullanicilar(id) on delete set null,
  olusturma_tarih       timestamptz not null default now(),
  guncelleme_tarih      timestamptz not null default now()
);

create index if not exists idx_toplu_bakimlar_durum   on public.toplu_bakimlar (durum);
create index if not exists idx_toplu_bakimlar_musteri on public.toplu_bakimlar (musteri_id);
create index if not exists idx_toplu_bakimlar_penel   on public.toplu_bakimlar (teknik_personel_id);
create index if not exists idx_toplu_bakimlar_tarih   on public.toplu_bakimlar (planlanan_tarih desc);

-- TB no üretimi — DAİMA SECURITY DEFINER + advisory lock (belge-no kuralı).
create or replace function public.toplu_bakim_no_uret()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_yil int := extract(year from coalesce(new.olusturma_tarih, now()))::int;
  v_son int;
begin
  if new.tb_no is not null and new.tb_no <> '' then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('toplu_bakim_no' || v_yil));
  select coalesce(max(substring(tb_no from '^TB-' || v_yil || '-(\d+)$')::int), 0)
    into v_son
    from toplu_bakimlar
   where tb_no ~ ('^TB-' || v_yil || '-\d+$');
  new.tb_no := 'TB-' || v_yil || '-' || lpad((v_son + 1)::text, 5, '0');
  return new;
end;
$$;
revoke all on function public.toplu_bakim_no_uret() from public;
revoke all on function public.toplu_bakim_no_uret() from anon;

drop trigger if exists tr_toplu_bakim_no on public.toplu_bakimlar;
create trigger tr_toplu_bakim_no
  before insert on public.toplu_bakimlar
  for each row execute function public.toplu_bakim_no_uret();

-- guncelleme_tarih otomatik
create or replace function public.toplu_bakim_guncelleme_damga()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  new.guncelleme_tarih := now();
  return new;
end;
$$;
revoke all on function public.toplu_bakim_guncelleme_damga() from public;
revoke all on function public.toplu_bakim_guncelleme_damga() from anon;

drop trigger if exists tr_toplu_bakim_guncelleme on public.toplu_bakimlar;
create trigger tr_toplu_bakim_guncelleme
  before update on public.toplu_bakimlar
  for each row execute function public.toplu_bakim_guncelleme_damga();

-- ---------------------------------------------------------------------------
-- 4) Alt kalemler — toplu_bakim_kalemleri
--    kalem_tip: cctv|turnike|ekran_led|fiber|hirsiz_alarm|sistem_odasi
-- ---------------------------------------------------------------------------
create table if not exists public.toplu_bakim_kalemleri (
  id               bigint generated always as identity primary key,
  toplu_bakim_id   bigint not null references public.toplu_bakimlar(id) on delete cascade,
  kalem_tip        text not null,
  alt_no           text,                          -- TB-YYYY-NNNNN-CCTV (trigger)
  -- Kalem durumu (madde 14): baslanmadi|devam_ediyor|tamamlandi|ariza_tespit|yapilamadi
  durum            text not null default 'baslanmadi',
  yapilamadi_sebep text,                          -- madde 16 sebep listesi
  cevaplar         jsonb not null default '{}',   -- şablon cevapları (tip'e özgü)
  sonuc_metni      text,                          -- otomatik hazır sonuç metni
  ariza_var        boolean not null default false,
  servis_talep_id  bigint,                        -- oluşan otomatik servis talebi (gevşek)
  form_pdf_url     text,                          -- ayrı bakım formu PDF'i
  baslama_tarih    timestamptz,
  bitis_tarih      timestamptz,
  olusturma_tarih  timestamptz not null default now(),
  guncelleme_tarih timestamptz not null default now(),
  unique (toplu_bakim_id, kalem_tip)              -- aynı işte aynı kalem 1 kez
);

create index if not exists idx_tb_kalem_bakim on public.toplu_bakim_kalemleri (toplu_bakim_id);
create index if not exists idx_tb_kalem_durum on public.toplu_bakim_kalemleri (durum);

-- Alt no: ana tb_no + tip eki. Ana no trigger'la atandığı için AFTER değil,
-- BEFORE INSERT'te parent'tan okunur — DEFINER (RLS'ten bağımsız görmeli).
create or replace function public.toplu_bakim_alt_no_uret()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tb text;
  v_ek text;
begin
  if new.alt_no is not null and new.alt_no <> '' then
    return new;
  end if;
  select tb_no into v_tb from toplu_bakimlar where id = new.toplu_bakim_id;
  v_ek := case new.kalem_tip
    when 'cctv'         then 'CCTV'
    when 'turnike'      then 'TURNIKE'
    when 'ekran_led'    then 'EKRAN'
    when 'fiber'        then 'FIBER'
    when 'hirsiz_alarm' then 'ALARM'
    when 'sistem_odasi' then 'SISTEMODASI'
    else upper(replace(new.kalem_tip, '_', ''))
  end;
  new.alt_no := coalesce(v_tb, '?') || '-' || v_ek;
  return new;
end;
$$;
revoke all on function public.toplu_bakim_alt_no_uret() from public;
revoke all on function public.toplu_bakim_alt_no_uret() from anon;

drop trigger if exists tr_tb_kalem_alt_no on public.toplu_bakim_kalemleri;
create trigger tr_tb_kalem_alt_no
  before insert on public.toplu_bakim_kalemleri
  for each row execute function public.toplu_bakim_alt_no_uret();

drop trigger if exists tr_tb_kalem_guncelleme on public.toplu_bakim_kalemleri;
create trigger tr_tb_kalem_guncelleme
  before update on public.toplu_bakim_kalemleri
  for each row execute function public.toplu_bakim_guncelleme_damga();

-- ---------------------------------------------------------------------------
-- 5) RLS — staff okur; oluşturma/silme saha sorumlusu; güncelleme staff
--    (teknik personel cevapları/durumu yazar — uygulama katmanı kuralları korur:
--    kalem ekleme-silme yalnız saha sorumlusu UI'da, mobilde alan yok).
-- ---------------------------------------------------------------------------
alter table public.toplu_bakimlar       enable row level security;
alter table public.toplu_bakim_kalemleri enable row level security;

drop policy if exists tb_staff_select on public.toplu_bakimlar;
create policy tb_staff_select on public.toplu_bakimlar
  for select to authenticated using ((select public.is_staff()));

drop policy if exists tb_saha_insert on public.toplu_bakimlar;
create policy tb_saha_insert on public.toplu_bakimlar
  for insert to authenticated with check ((select public.saha_sorumlusu_mu()));

drop policy if exists tb_staff_update on public.toplu_bakimlar;
create policy tb_staff_update on public.toplu_bakimlar
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

drop policy if exists tb_saha_delete on public.toplu_bakimlar;
create policy tb_saha_delete on public.toplu_bakimlar
  for delete to authenticated using ((select public.saha_sorumlusu_mu()));

drop policy if exists tbk_staff_select on public.toplu_bakim_kalemleri;
create policy tbk_staff_select on public.toplu_bakim_kalemleri
  for select to authenticated using ((select public.is_staff()));

drop policy if exists tbk_saha_insert on public.toplu_bakim_kalemleri;
create policy tbk_saha_insert on public.toplu_bakim_kalemleri
  for insert to authenticated with check ((select public.saha_sorumlusu_mu()));

drop policy if exists tbk_staff_update on public.toplu_bakim_kalemleri;
create policy tbk_staff_update on public.toplu_bakim_kalemleri
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

drop policy if exists tbk_saha_delete on public.toplu_bakim_kalemleri;
create policy tbk_saha_delete on public.toplu_bakim_kalemleri
  for delete to authenticated using ((select public.saha_sorumlusu_mu()));

commit;

select pg_notify('pgrst', 'reload schema');
