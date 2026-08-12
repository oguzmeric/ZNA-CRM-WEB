-- 283 — Proforma kalem/tutar düzeltme izi (12.08.2026)
--
-- SORUN: Teknisyen mobilden servis faturasının kalemlerini fiyatlıyor (mig 282
-- günü devreye giren akış). Fatura yetkilisi (Abdullah) bu tutarı YANLIŞ bulursa
-- düzeltemiyordu — `FaturaTalepleri` ekranı tutar alanlarını yalnız `genel_toplam = 0`
-- iken açıyor. Tek çıkış yolu proformayı REDDETMEK ve teknisyene geri
-- göndermekti; teknisyen sahadayken bu yarım gün kaybettiriyor.
--
-- ÇÖZÜM: Yetkili kalemleri yerinde düzeltebilsin. Ancak düzeltme SESSİZ olmamalı —
-- teknisyenin girdiği rakam ile faturalanan rakam farklıysa bu iz bırakmalı,
-- yoksa "ben 5.000 yazmıştım" tartışmasının hakemi olmaz.
--
-- `ilk_genel_toplam` YALNIZ ilk düzeltmede dolar ve BİR DAHA değişmez. Bunu
-- istemciye bırakmıyoruz: iki sekmeden arka arkaya düzeltme yapılırsa ikinci
-- yazma birincinin okuduğu değeri ezer ve teknisyenin girdiği rakam kaybolur.
-- Doldurmayı da korumayı da aşağıdaki trigger yapar.

alter table public.fatura_talepleri
  add column if not exists kalem_duzenleyen_id     bigint,
  add column if not exists kalem_duzenleyen_ad     text,
  add column if not exists kalem_duzenleme_tarihi  timestamptz,
  add column if not exists ilk_genel_toplam        numeric(14,2);

comment on column public.fatura_talepleri.ilk_genel_toplam is
  'Kalemleri ilk düzeltmeden ÖNCEKİ genel toplam (teknisyenin/kaynağın girdiği). Sonraki düzeltmeler bunu ezmez.';
comment on column public.fatura_talepleri.kalem_duzenleyen_ad is
  'Kalemleri en son düzelten fatura yetkilisi. Boşsa kalemler kaynağından geldiği gibidir.';

-- İlk tutarı DB koru: istemci `ilk_genel_toplam` YAZMAZ, trigger doldurur.
-- Kalem düzeltmesinin işareti `kalem_duzenleme_tarihi`'nin değişmesidir.
create or replace function public.fatura_talep_ilk_toplam_fn()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.kalem_duzenleme_tarihi is distinct from old.kalem_duzenleme_tarihi then
    -- İlk düzeltmede ESKİ toplam saklanır; sonrakiler ona dokunamaz.
    new.ilk_genel_toplam = coalesce(old.ilk_genel_toplam, old.genel_toplam);
  else
    -- Kalem düzeltmesi dışındaki hiçbir güncelleme bu alanı değiştiremez
    -- (fatura kesimi, irsaliye yükleme, bedelsiz işaretleme…).
    new.ilk_genel_toplam = old.ilk_genel_toplam;
  end if;
  return new;
end;
$$;

drop trigger if exists tr_fatura_talep_ilk_toplam on public.fatura_talepleri;
create trigger tr_fatura_talep_ilk_toplam
  before update on public.fatura_talepleri
  for each row execute function public.fatura_talep_ilk_toplam_fn();

-- Denetim sorgusu: "hangi proformalarda muhasebe tutarı değiştirdi?"
create index if not exists fatura_talepleri_kalem_duzenleme_idx
  on public.fatura_talepleri (kalem_duzenleme_tarihi desc)
  where kalem_duzenleme_tarihi is not null;

-- ⚠️ RLS DEĞİŞMEDİ. `fatura_talep_yetkili_all` politikası teklif görebilen
-- herkese UPDATE veriyor; fatura yetkisi kapısı istemci tarafında
-- (`faturaYetkisi()`). Kalem düzeltme de aynı kapının arkasında — fatura kesme,
-- reddetme ve bedelsiz kapatma zaten böyle çalışıyor. Sıkılaştırma yapılacaksa
-- dördü BİRLİKTE ele alınmalı, tek başına burada değil.
