-- 303 — İK Puantaj: brüt maaş kaydı + mesai ücret hesabı (17.08.2026)
--
-- İSTEK: Abdullah İğdeli personel maaşlarını girer; ay içindeki fazla
-- mesaileri görüp maaşa göre mesai ücretini hesaplayan sekme (IKYonetim).
--
-- FORMÜL (kullanıcının verdiği belge — "Mesai ücreti hesaplanırken çalışılan
-- günün niteliği.docx"):
--   saat ücreti      = brüt maaş ÷ 225
--   hafta içi FM     = saat ücreti × 1,5   (%50 zam)
--   Pazar            = saat ücreti × 2,5   (%150 zam — hafta tatili)
--   resmî tatil      = saat ücreti × 2,0   (%100 zam)
-- Katsayılar ve bölen AYARLANABİLİR (kullanıcı kararı: "katsayıyı Abdullah
-- ayarlasın") — varsayılanlar belgeden.
--
-- VERİ KAYNAĞI: mesai_kayitlari.tip = 'fazla' kayıtlarının sure_dakika'sı
-- (fazla mesai zaten AYRI QR kaydı olarak tutuluyor; 17.08 ölçümü: 28 kayıt).
-- Pazar ayrımı kaydın TR gününden. Resmî tatil takvimi sistemde YOK —
-- o sütun yalnız elle düzeltmeyle dolar.
--
-- GİZLİLİK: yalnız Abdullah (id 44) + admin. RLS satır düzeyinde; sayfa
-- kapısı (IKGuard) tek başına yeterli DEĞİL.

begin;

-- ── Yetki kapısı (tek yerde) ─────────────────────────────────────────────
create or replace function public.ik_puantaj_yetkili()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.kullanicilar k
     where k.auth_id = auth.uid()
       and (k.id = 44 or (k.rol = 'admin' and k.tip = 'zna'))
  );
$$;
revoke all on function public.ik_puantaj_yetkili() from public, anon;
grant execute on function public.ik_puantaj_yetkili() to authenticated;

-- ── Brüt maaş kayıtları (geçmişli: zam = yeni satır, eski dönem bozulmaz) ─
create table if not exists public.personel_maaslari (
  id bigint generated always as identity primary key,
  kullanici_id bigint not null references public.kullanicilar(id),
  gecerli_baslangic date not null,             -- bu tarihten itibaren geçerli
  brut_tutar numeric(12,2) not null check (brut_tutar > 0),
  not_ text,
  ekleyen_id bigint references public.kullanicilar(id),
  olusturma_tarih timestamptz not null default now(),
  unique (kullanici_id, gecerli_baslangic)
);

-- ── Puantaj ayarları (tek satır) ─────────────────────────────────────────
create table if not exists public.ik_puantaj_ayarlar (
  id int primary key default 1 check (id = 1),
  aylik_saat_bolen numeric(6,2) not null default 225 check (aylik_saat_bolen > 0),
  hafta_ici_katsayi numeric(4,2) not null default 1.5 check (hafta_ici_katsayi > 0),
  pazar_katsayi numeric(4,2) not null default 2.5 check (pazar_katsayi > 0),
  resmi_tatil_katsayi numeric(4,2) not null default 2.0 check (resmi_tatil_katsayi > 0),
  guncelleyen_id bigint references public.kullanicilar(id),
  guncelleme_tarih timestamptz not null default now()
);
insert into public.ik_puantaj_ayarlar (id) values (1) on conflict (id) do nothing;

-- ── Elle düzeltmeler (dönem + kişi; NULL = otomatik değer geçerli) ───────
create table if not exists public.puantaj_duzeltmeler (
  id bigint generated always as identity primary key,
  kullanici_id bigint not null references public.kullanicilar(id),
  donem_yil int not null check (donem_yil between 2020 and 2100),
  donem_ay int not null check (donem_ay between 1 and 12),
  hafta_ici_dakika int check (hafta_ici_dakika >= 0),
  pazar_dakika int check (pazar_dakika >= 0),
  resmi_tatil_dakika int not null default 0 check (resmi_tatil_dakika >= 0),
  aciklama text not null,                      -- düzeltme gerekçesi ZORUNLU
  duzelten_id bigint references public.kullanicilar(id),
  guncelleme_tarih timestamptz not null default now(),
  unique (kullanici_id, donem_yil, donem_ay)
);

-- ── RLS: üç tablo da yalnız Abdullah + admin ─────────────────────────────
alter table public.personel_maaslari enable row level security;
alter table public.ik_puantaj_ayarlar enable row level security;
alter table public.puantaj_duzeltmeler enable row level security;

drop policy if exists personel_maaslari_ik on public.personel_maaslari;
create policy personel_maaslari_ik on public.personel_maaslari
  for all using ((select public.ik_puantaj_yetkili()))
  with check ((select public.ik_puantaj_yetkili()));

drop policy if exists ik_puantaj_ayarlar_ik on public.ik_puantaj_ayarlar;
create policy ik_puantaj_ayarlar_ik on public.ik_puantaj_ayarlar
  for all using ((select public.ik_puantaj_yetkili()))
  with check ((select public.ik_puantaj_yetkili()));

drop policy if exists puantaj_duzeltmeler_ik on public.puantaj_duzeltmeler;
create policy puantaj_duzeltmeler_ik on public.puantaj_duzeltmeler
  for all using ((select public.ik_puantaj_yetkili()))
  with check ((select public.ik_puantaj_yetkili()));

grant select, insert, update, delete on public.personel_maaslari to authenticated;
grant select, update on public.ik_puantaj_ayarlar to authenticated;
grant select, insert, update, delete on public.puantaj_duzeltmeler to authenticated;
revoke all on public.personel_maaslari from anon;
revoke all on public.ik_puantaj_ayarlar from anon;
revoke all on public.puantaj_duzeltmeler from anon;

-- ── Dönem özeti: kişi bazında fazla mesai dakikaları ─────────────────────
-- SECURITY DEFINER: mesai_kayitlari RLS'inden bağımsız TÜM personeli görür
-- (global rapor); kapı fonksiyonun İÇİNDE.
create or replace function public.puantaj_donem_ozeti(p_yil int, p_ay int)
returns table (
  kullanici_id bigint,
  hafta_ici_dakika bigint,
  pazar_dakika bigint,
  kayit_sayisi bigint,
  acik_kayit_sayisi bigint            -- çıkışı kapanmamış fazla mesai (uyarı)
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.ik_puantaj_yetkili() then
    raise exception 'yetkisiz';
  end if;
  return query
  select m.kullanici_id,
         coalesce(sum(m.sure_dakika) filter (
           where extract(isodow from m.giris_zamani at time zone 'Europe/Istanbul') < 7
             and m.cikis_zamani is not null), 0)::bigint,
         coalesce(sum(m.sure_dakika) filter (
           where extract(isodow from m.giris_zamani at time zone 'Europe/Istanbul') = 7
             and m.cikis_zamani is not null), 0)::bigint,
         count(*) filter (where m.cikis_zamani is not null),
         count(*) filter (where m.cikis_zamani is null)
    from public.mesai_kayitlari m
   where m.tip = 'fazla'
     and extract(year  from m.giris_zamani at time zone 'Europe/Istanbul') = p_yil
     and extract(month from m.giris_zamani at time zone 'Europe/Istanbul') = p_ay
   group by m.kullanici_id;
end;
$$;
revoke all on function public.puantaj_donem_ozeti(int, int) from public, anon;
grant execute on function public.puantaj_donem_ozeti(int, int) to authenticated;

commit;
