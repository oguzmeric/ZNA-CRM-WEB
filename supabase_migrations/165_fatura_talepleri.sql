-- Fatura Talebi modülü (F1).
--
-- Sorun: teklifteki "Fatura Oluştur" doğrudan düzenlenebilir bir fatura formu
-- açıyor, istemci tarafında FAT-YYYY-NNN numarası üretip forma yazıyordu. Yani
-- satışçı fatura numarasını kendisi uyduruyor, muhasebe sürecin dışında kalıyordu.
-- Ayrıca devir localStorage ile yapıldığı için müşteri e-posta/telefon, para
-- birimi, vade ve notlar hiç taşınmıyordu.
--
-- Yeni akış: satışçı NUMARASIZ bir fatura TALEBİ açar (teklifin tam anlık
-- görüntüsü ile) → talep "Fatura Oluşturulacak" kuyruğuna düşer → fatura
-- yetkilisi gerçek faturayı keser, numarasını girer ve PDF'ini yükler →
-- ancak o zaman satislar kaydı oluşur.

-- ---------- 1. Yetki ----------
-- Desen: teklif_onay_yetkilisi (mig 074). Adminler (Ali/Oğuz) kod tarafında
-- zaten her zaman görür; bu bayrak admin olmayan yetkilileri işaretler.
alter table kullanicilar
  add column if not exists fatura_yetkilisi boolean not null default false;

comment on column kullanicilar.fatura_yetkilisi is
  'Fatura Oluşturulacak kuyruğunu görür; fatura no + PDF girip satışa dönüştürebilir.';

-- Abdullah İğde — muhasebe/fatura sorumlusu
update kullanicilar set fatura_yetkilisi = true where id = 44;

-- ---------- 2. Talep tablosu ----------
create table if not exists fatura_talepleri (
  id             bigserial primary key,
  talep_no       text unique,

  -- Kaynak teklif
  teklif_id      bigint,
  teklif_no      text,

  -- Müşteri künyesi (talep anındaki ANLIK GÖRÜNTÜ — teklif sonradan
  -- değişse bile muhasebenin gördüğü bilgi sabit kalsın)
  musteri_id     bigint,
  firma_adi      text not null,
  yetkili_adi    text,
  vergi_no       text,
  vergi_dairesi  text,
  adres          text,
  telefon        text,
  email          text,

  -- Tutar / içerik
  konu           text,
  para_birimi    text not null default 'TL',
  doviz_kuru     numeric(12,4),
  kalemler       jsonb not null default '[]'::jsonb,
  ara_toplam     numeric(14,2) not null default 0,
  kdv_toplam     numeric(14,2) not null default 0,
  genel_toplam   numeric(14,2) not null default 0,
  odeme_sekli    text,
  vade_tarihi    date,

  -- Talep
  durum          text not null default 'bekliyor',
  talep_notu     text,                       -- satışçıdan muhasebeye
  talep_eden_id  bigint references kullanicilar(id) on delete set null,
  talep_eden_ad  text,
  talep_tarihi   timestamptz not null default now(),

  -- Faturalama (F2'de doldurulur)
  fatura_no          text,
  fatura_tarihi      date,
  fatura_pdf_yol     text,                   -- storage path (URL değil)
  fatura_pdf_ad      text,
  faturalayan_id     bigint references kullanicilar(id) on delete set null,
  faturalayan_ad     text,
  faturalama_tarihi  timestamptz,
  satis_id           text,                   -- satislar.id (canlıda uuid/text)

  red_nedeni     text,
  meta           jsonb not null default '{}'::jsonb,
  olusturma_tarih  timestamptz not null default now(),
  guncelleme_tarih timestamptz not null default now()
);

alter table fatura_talepleri drop constraint if exists fatura_talepleri_durum_chk;
alter table fatura_talepleri
  add constraint fatura_talepleri_durum_chk
  check (durum in ('bekliyor', 'faturalandi', 'reddedildi', 'iptal'));

create index if not exists idx_fatura_talep_durum on fatura_talepleri(durum, talep_tarihi desc);
create index if not exists idx_fatura_talep_teklif on fatura_talepleri(teklif_id);

-- Aynı teklif için birden fazla AÇIK talep olmasın (reddedilen/iptal sonrası
-- yeniden talep açılabilsin diye partial index)
create unique index if not exists uq_fatura_talep_acik_teklif
  on fatura_talepleri(teklif_id)
  where durum = 'bekliyor' and teklif_id is not null;

-- ---------- 3. Talep no: FTL-YYYY-NNNNNN ----------
-- İstemci sayacı YARIŞ/DUPLİKASYON üretir — numara DB'de, advisory lock ile.
create or replace function fatura_talep_no_uret()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_yil text;
  v_son int;
begin
  if new.talep_no is not null and btrim(new.talep_no) <> '' then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('fatura_talep_no'));
  v_yil := to_char(current_date, 'YYYY');
  select coalesce(max(substring(talep_no from '^FTL-\d{4}-(\d+)$')::int), 0)
    into v_son
    from fatura_talepleri
   where talep_no like 'FTL-' || v_yil || '-%';
  new.talep_no := 'FTL-' || v_yil || '-' || lpad((v_son + 1)::text, 6, '0');
  return new;
end;
$$;

drop trigger if exists tr_fatura_talep_no on fatura_talepleri;
create trigger tr_fatura_talep_no
  before insert on fatura_talepleri
  for each row execute function fatura_talep_no_uret();

create or replace function fatura_talep_guncelleme_tarih()
returns trigger language plpgsql set search_path = public as $$
begin
  new.guncelleme_tarih := now();
  return new;
end;
$$;

drop trigger if exists tr_fatura_talep_guncelleme on fatura_talepleri;
create trigger tr_fatura_talep_guncelleme
  before update on fatura_talepleri
  for each row execute function fatura_talep_guncelleme_tarih();

-- ---------- 4. RLS ----------
alter table fatura_talepleri enable row level security;
drop policy if exists fatura_talep_all on fatura_talepleri;
create policy fatura_talep_all on fatura_talepleri for all
  using (is_staff()) with check (is_staff());

-- ---------- 5. fatura-belge bucket (private) ----------
insert into storage.buckets (id, name, public)
values ('fatura-belge', 'fatura-belge', false)
on conflict do nothing;

drop policy if exists fatura_belge_sel on storage.objects;
create policy fatura_belge_sel on storage.objects for select
  using (bucket_id = 'fatura-belge' and is_staff());
drop policy if exists fatura_belge_ins on storage.objects;
create policy fatura_belge_ins on storage.objects for insert
  with check (bucket_id = 'fatura-belge' and is_staff());
drop policy if exists fatura_belge_del on storage.objects;
create policy fatura_belge_del on storage.objects for delete
  using (bucket_id = 'fatura-belge' and is_staff());

notify pgrst, 'reload schema';
