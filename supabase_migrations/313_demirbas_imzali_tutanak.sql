-- 313 — Islak imzali teslim tutanagi arsivi
--
-- Akis: tutanak yazdirilir -> teslim eden + teslim alan imzalar -> taranir ->
-- PDF sisteme geri yuklenir. Boylece belgenin aslinin nerede oldugu sorusu
-- ortadan kalkar; sicil kartindan tek tikla acilir.
--
-- Ayni desen demo cihaz tutanaginda ZATEN VAR
-- (demo_zimmet_kayitlari.imzali_tutanak_url + private 'demo-tutanak' bucket).
-- Bilerek birebir taklit edildi: DB'de PATH saklanir, gosterirken signed URL
-- uretilir. Public bucket KULLANILMAZ -- tutanakta personelin adi, cihaz seri
-- numarasi ve imzasi var, link sizarsa herkese acik olur.
--
-- ⚠️ Imzali belge TUTANAK bazlidir, kalem bazli DEGIL: ayni tutanak_no'yu
-- paylasan TUM satirlara ayni yol yazilir. Bir tarama, N kalem. Bu, mig 312'nin
-- "tutanak ayri tablo degil, tutanak_no paylasilir" tasariminin dogal sonucu.

-- ── 1) Kolonlar ──────────────────────────────────────────────────────────
alter table public.demirbas_zimmet
  add column if not exists imzali_tutanak_yolu  text,
  add column if not exists imzali_yukleyen_id   bigint references public.kullanicilar(id),
  add column if not exists imzali_yukleme_tarih timestamptz;

comment on column public.demirbas_zimmet.imzali_tutanak_yolu is
  'Islak imzali taranmis tutanagin storage yolu (bucket: demirbas-tutanak). '
  'Private bucket -- gosterirken createSignedUrl ile gecici link uretilir.';
comment on column public.demirbas_zimmet.imzali_yukleyen_id is
  'Taramayi sisteme yukleyen personel -- evrak sorumlulugunun izi.';

-- Imzali belge ancak TUTANAGI OLAN kaleme baglanabilir: imza atilan sey
-- tutanaktir, tutanaksiz kalemin imzalisi da olamaz.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'demirbas_imzali_tutanak_gerektirir'
  ) then
    alter table public.demirbas_zimmet
      add constraint demirbas_imzali_tutanak_gerektirir
      check (imzali_tutanak_yolu is null or tutanak_no is not null);
  end if;
end $$;

-- ── 2) Bucket ────────────────────────────────────────────────────────────
-- 15 MB: cok sayfali renkli tarama rahat sigar, ama yanlislikla video
-- yuklenmesini engeller. HEIC BILEREK YOK -- web tarayicilari acamiyor
-- (bkz. reference_heic_foto_tuzagi); tarayicidan cikan PDF/JPG zaten yeterli.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'demirbas-tutanak', 'demirbas-tutanak', false, 15728640,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── 3) Storage politikalari ──────────────────────────────────────────────
-- demo-tutanak is_staff() kullaniyor; burada BILEREK demirbas_yetkili():
-- demirbas_zimmet tablosunun RLS'i de ona bakiyor, belge ile satir ayni
-- kapidan gecsin. Aksi halde satiri goremeyen biri belgeyi indirebilirdi.
drop policy if exists demirbas_tutanak_sel on storage.objects;
create policy demirbas_tutanak_sel on storage.objects
  for select to authenticated
  using (bucket_id = 'demirbas-tutanak' and (select public.demirbas_yetkili()));

drop policy if exists demirbas_tutanak_ins on storage.objects;
create policy demirbas_tutanak_ins on storage.objects
  for insert to authenticated
  with check (bucket_id = 'demirbas-tutanak' and (select public.demirbas_yetkili()));

-- Yanlis/egri tarama yuklenince duzeltilebilsin (upsert + degistir akisi).
drop policy if exists demirbas_tutanak_upd on storage.objects;
create policy demirbas_tutanak_upd on storage.objects
  for update to authenticated
  using (bucket_id = 'demirbas-tutanak' and (select public.demirbas_yetkili()))
  with check (bucket_id = 'demirbas-tutanak' and (select public.demirbas_yetkili()));

drop policy if exists demirbas_tutanak_del on storage.objects;
create policy demirbas_tutanak_del on storage.objects
  for delete to authenticated
  using (bucket_id = 'demirbas-tutanak' and (select public.demirbas_yetkili()));

-- ── 4) Yukleme RPC'si ────────────────────────────────────────────────────
-- Dosya istemciden bucket'a gider; DB tarafinda yalniz "hangi tutanaga
-- baglandi" yazilir. Tek tutanak_no'lu TUM satirlar birlikte guncellenir --
-- istemciye "once satirlari bul, sonra tek tek yaz" dedirtmek yaris yaratir.
--
-- SECURITY DEFINER + acik yetki kapisi: RLS zaten demirbas_yetkili() istiyor,
-- ama RPC tanimlayici hakkiyla calistigi icin kapiyi BURADA da acikca kuruyoruz
-- (bkz. reference_rls_returning_tuzagi -- sessiz bos donus yerine net hata).
create or replace function public.demirbas_imzali_tutanak_kaydet(
  p_tutanak_no text,
  p_yol        text
)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_kullanici_id bigint;
  v_adet         integer;
begin
  if not public.demirbas_yetkili() then
    raise exception 'Bu islem icin demirbas yetkisi gerekiyor.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_tutanak_no is null or btrim(p_tutanak_no) = '' then
    raise exception 'Tutanak numarasi bos olamaz.' using errcode = 'invalid_parameter_value';
  end if;

  select k.id into v_kullanici_id
    from public.kullanicilar k
   where k.auth_id = auth.uid()
   limit 1;

  update public.demirbas_zimmet
     set imzali_tutanak_yolu  = p_yol,
         imzali_yukleyen_id   = case when p_yol is null then null else v_kullanici_id end,
         imzali_yukleme_tarih = case when p_yol is null then null else now() end
   where tutanak_no = p_tutanak_no;

  get diagnostics v_adet = row_count;

  if v_adet = 0 then
    raise exception 'Tutanak bulunamadi: %', p_tutanak_no
      using errcode = 'no_data_found';
  end if;

  return v_adet;
end;
$$;

revoke all on function public.demirbas_imzali_tutanak_kaydet(text, text) from public, anon;
grant execute on function public.demirbas_imzali_tutanak_kaydet(text, text) to authenticated;

comment on function public.demirbas_imzali_tutanak_kaydet(text, text) is
  'Imzali taranmis tutanagi bir tutanak_no altindaki TUM demirbas satirlarina '
  'baglar. p_yol NULL verilirse bag kaldirilir (yanlis tarama duzeltmesi).';
