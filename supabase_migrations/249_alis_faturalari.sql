-- 249 — Tedarikçi (alış) faturaları
--
-- Talep: "tedarikçi firmalara iletilen siparişlerin karşılığında firmalardan
-- gelen faturaları yükleyeceğimiz bir buton" (Abdullah İğde / muhasebe).
--
-- Bağlam: siparisler tablosu MÜŞTERİ siparişidir. ZNA malı stoktan
-- karşılayamayınca tedarikçiden satın alıyor ve tedarikçiye referans olarak
-- kendi sipariş numarasını veriyor; tedarikçi de faturanın açıklamasına o
-- numarayı yazıyor (ör. ANIL Telekomünikasyon → ZNA-SIP-2026-000023).
-- Burada tutulan fatura GELEN/ALIŞ faturasıdır — fatura_talepleri ve satislar
-- tablolarındaki GİDEN (satış) faturalarıyla karıştırılmamalıdır.
--
-- Neden ayrı tablo, siparisler'e kolon değil: bir sipariş birden çok
-- tedarikçiden karşılanabilir ve kısmi sevkiyatta birden çok fatura gelir.
-- Kolon eklemek modeli 1:1'e mühürlerdi.

begin;

-- ---------- Yetki fonksiyonu ----------
-- Alış faturaları MALİYET bilgisidir; siparişlerin geneli gibi is_staff()'a
-- açılmaz. src/lib/siparisYetki.js -> siparisYonetimiGorebilirMi ile AYNI
-- kural: admin (zna) veya Abdullah İğde (44). Yeni kişi eklenecekse İKİ yerde
-- birden güncellenmeli.
create or replace function public.siparis_yonetimi_yetkili()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select exists (
    select 1 from kullanicilar
     where auth_id = auth.uid()
       and coalesce(hesap_silindi, false) = false
       and (
         (rol = 'admin' and coalesce(tip, '') = 'zna')
         or id = 44
       )
  );
$fn$;

revoke execute on function public.siparis_yonetimi_yetkili() from anon;

-- ---------- Tablo ----------
create table if not exists public.alis_faturalari (
  id                   bigserial primary key,
  -- restrict: fatura muhasebe belgesidir, siparişle birlikte sessizce silinmez
  siparis_id           bigint not null references public.siparisler(id) on delete restrict,

  -- Tedarikçi: musteriler tablosundaki 320'li (SATICILAR) cari kart.
  -- Kart yoksa serbest metin yeterli — tedarikci_ad her zaman doldurulur.
  tedarikci_musteri_id bigint references public.musteriler(id) on delete set null,
  tedarikci_ad         text not null,
  tedarikci_vergi_no   text,

  -- DİKKAT: fatura_no TEDARİKÇİNİN numarasıdır, bizim değil. Global unique
  -- OLAMAZ (farklı firmalar aynı numarayı kullanır). Tekillik sipariş içinde.
  fatura_no            text not null,
  fatura_tarihi        date,
  ettn                 text,

  para_birimi          text not null default 'TL',
  ara_toplam           numeric(14,2),
  kdv_toplam           numeric(14,2),
  genel_toplam         numeric(14,2) not null default 0,

  dosya_yol            text not null,   -- storage PATH (URL değil — signed URL anlık üretilir)
  dosya_ad             text,

  aciklama             text,
  yukleyen_id          bigint references public.kullanicilar(id) on delete set null,
  yukleyen_ad          text,
  olusturma_tarih      timestamptz not null default now(),
  guncelleme_tarih     timestamptz not null default now()
);

-- Aynı faturanın aynı siparişe iki kez yüklenmesini engeller
create unique index if not exists uq_alis_fatura_siparis_no
  on public.alis_faturalari (siparis_id, fatura_no);

create index if not exists ix_alis_fatura_siparis
  on public.alis_faturalari (siparis_id);
create index if not exists ix_alis_fatura_tedarikci
  on public.alis_faturalari (tedarikci_musteri_id);

-- ---------- guncelleme_tarih trigger ----------
create or replace function public.alis_fatura_guncelleme_damgasi()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  new.guncelleme_tarih := now();
  return new;
end;
$fn$;

drop trigger if exists tr_alis_fatura_guncelleme on public.alis_faturalari;
create trigger tr_alis_fatura_guncelleme
  before update on public.alis_faturalari
  for each row execute function public.alis_fatura_guncelleme_damgasi();

-- ---------- RLS ----------
alter table public.alis_faturalari enable row level security;

drop policy if exists alis_fatura_all on public.alis_faturalari;
-- (select ...) sarmalı initplan optimizasyonu içindir — satır başına
-- değerlendirilmesin (bkz. mig 227-228 performans dersi).
create policy alis_fatura_all on public.alis_faturalari
  for all
  using ((select public.siparis_yonetimi_yetkili()))
  with check ((select public.siparis_yonetimi_yetkili()));

-- ---------- Storage bucket ----------
-- AYRI bucket: fatura-belge bucket'ı satış tarafının (fatura_talepleri) ve yol
-- deseni "<talepId>/fatura-*.pdf". Aynı bigint id iki tabloda çakışırsa
-- faturaPdfSil yanlış dosyayı geri dönüşsüz silerdi.
insert into storage.buckets (id, name, public)
values ('alis-fatura-belge', 'alis-fatura-belge', false)
on conflict (id) do nothing;

drop policy if exists alis_fatura_belge_sel on storage.objects;
create policy alis_fatura_belge_sel on storage.objects
  for select using (bucket_id = 'alis-fatura-belge' and (select public.siparis_yonetimi_yetkili()));

drop policy if exists alis_fatura_belge_ins on storage.objects;
create policy alis_fatura_belge_ins on storage.objects
  for insert with check (bucket_id = 'alis-fatura-belge' and (select public.siparis_yonetimi_yetkili()));

drop policy if exists alis_fatura_belge_del on storage.objects;
create policy alis_fatura_belge_del on storage.objects
  for delete using (bucket_id = 'alis-fatura-belge' and (select public.siparis_yonetimi_yetkili()));

commit;

notify pgrst, 'reload schema';
