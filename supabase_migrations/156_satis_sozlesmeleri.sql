-- 156: Satış Sözleşmesi Otomasyon Modülü (kaynak: "SÖZLEŞMLER (SATIŞ).docx", 2026-07-14)
--
-- Teklif/siparişten tek tuşla satış sözleşmesi: otomatik hesap (vade farkı +
-- damga vergisi + iskonto), dinamik madde havuzu (kod tarafında), yönetici
-- onayı + kilitleme, evrak checklist, kur farkı takibi.
--
-- 1. satis_sozlesmeleri — ZNA-SS-YYYY-NNNN trigger'lı
-- 2. siparisler.sozlesme_id — "Sözleşmeli Sipariş" işareti
-- 3. satis-sozlesme private bucket
-- 4. paylaşım: belge_tipi 'satis_sozlesme' + anon okuma RPC'si

create table if not exists satis_sozlesmeleri (
  id                 bigserial primary key,
  sozlesme_no        text unique,
  durum              text not null default 'taslak'
                     check (durum in ('taslak','yonetici_onayinda','onaylandi','gonderildi','imzalandi','iptal')),
  kilitli            boolean not null default false,
  sablon_tipi        text not null default 'standart',
  -- Bağlantılar (ana akışta görüşme/teklif/sipariş no'suna bağlı — spec §1)
  musteri_id         bigint,
  gorusme_no         text,
  teklif_id          bigint references teklifler(id) on delete set null,
  teklif_no          text,
  siparis_id         bigint references siparisler(id) on delete set null,
  siparis_no         text,
  -- Alıcı bilgileri (spec §2)
  firma_tipi         text default 'limited'
                     check (firma_tipi in ('sahis','limited','anonim','kamu','dernek','vakif')),
  firma_adi          text,
  yetkili_adi        text,
  tc_vergi_no        text,
  vergi_dairesi      text,
  adres              text,
  telefon            text,
  email              text,
  imza_yetkilisi     text,
  imza_belgesi_istenir boolean not null default true,
  -- Proje bilgileri
  proje_adi          text,
  lokasyon           text,
  kurum_adi          text,
  ana_yuklenici      text,
  isin_konusu        text,
  is_suresi          text,
  teslim_sekli       text,
  montaj_dahil       boolean not null default false,
  devreye_alma_dahil boolean not null default false,
  egitim_dahil       boolean not null default false,
  bakim_dahil        boolean not null default false,
  -- Ödeme bilgileri
  para_birimi        text not null default 'TL' check (para_birimi in ('TL','USD','EUR')),
  odeme_tipi         text not null default 'pesin'
                     check (odeme_tipi in ('pesin','havale','kredi_karti','cek','senet','parcali')),
  vade_gunu          int not null default 0,
  vade_orani         numeric(6,3) not null default 0,    -- aylık % (örn 4.5)
  damga_orani        numeric(8,6) not null default 0.00948,
  damga_dahil        boolean not null default true,
  kur_farki_uygulanir boolean not null default false,
  kur_tipi           text default 'tcmb_satis' check (kur_tipi in ('tcmb_satis','efektif_satis','ozel')),
  ozel_kur           numeric(14,4),
  cek_tarihi         date,
  cek_bankasi        text,
  cek_no             text,
  cek_tutar_tl       numeric(14,2),
  cek_kuru           numeric(14,4),
  iskonto            numeric(14,2) not null default 0,
  yuvarlama          numeric(14,2) not null default 0,
  -- Otomatik hesap (spec §3) — KDV dahil ana toplam üzerinden
  ana_toplam         numeric(14,2) not null default 0,
  vade_farki         numeric(14,2) not null default 0,
  damga_vergisi      numeric(14,2) not null default 0,
  nihai_toplam       numeric(14,2) not null default 0,
  urun_listesi       jsonb not null default '[]'::jsonb,
  -- Üretilen içerik + imzalı dosya
  uretilen_icerik    text,
  imzali_pdf_url     text,
  imzali_pdf_ad      text,
  -- Evrak checklist (firma tipine göre otomatik liste — spec §7)
  evraklar           jsonb not null default '[]'::jsonb,
  -- Kur farkı takibi (spec §10)
  vade_tarihi        date,
  tahsil_kuru        numeric(14,4),
  kur_farki_tl       numeric(14,2),
  kur_farki_durumu   text not null default 'yok'
                     check (kur_farki_durumu in ('yok','izleniyor','olustu','faturalandi')),
  -- Akış meta
  hazirlayan_id      bigint,
  hazirlayan_ad      text,
  onaylayan_id       bigint,
  onaylayan_ad       text,
  onay_tarihi        timestamptz,
  onaya_gonderim_tarihi timestamptz,
  gonderim_tarihi    timestamptz,
  imza_tarihi        timestamptz,
  red_sebebi         text,
  notlar             text,
  olusturma_tarih    timestamptz not null default now(),
  guncelleme_tarih   timestamptz not null default now()
);

create index if not exists idx_satis_soz_durum   on satis_sozlesmeleri(durum);
create index if not exists idx_satis_soz_teklif  on satis_sozlesmeleri(teklif_id) where teklif_id is not null;
create index if not exists idx_satis_soz_siparis on satis_sozlesmeleri(siparis_id) where siparis_id is not null;

alter table satis_sozlesmeleri enable row level security;
drop policy if exists satis_soz_all on satis_sozlesmeleri;
create policy satis_soz_all on satis_sozlesmeleri for all
  using (is_staff()) with check (is_staff());

-- Sözleşme no: ZNA-SS-YYYY-NNNN
create or replace function satis_sozlesme_no_uret()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_yil text;
  v_son int;
begin
  if new.sozlesme_no is not null and new.sozlesme_no <> '' then
    return new;
  end if;
  v_yil := to_char(current_date, 'YYYY');
  select coalesce(max(substring(sozlesme_no from '^ZNA-SS-\d{4}-(\d+)$')::int), 0)
    into v_son
  from satis_sozlesmeleri
  where sozlesme_no like 'ZNA-SS-' || v_yil || '-%';
  new.sozlesme_no := 'ZNA-SS-' || v_yil || '-' || lpad((v_son + 1)::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists tr_satis_sozlesme_no on satis_sozlesmeleri;
create trigger tr_satis_sozlesme_no
  before insert on satis_sozlesmeleri
  for each row execute function satis_sozlesme_no_uret();

-- ---------- 2. Sözleşmeli Sipariş işareti ----------
alter table siparisler add column if not exists sozlesme_id bigint;

-- ---------- 3. satis-sozlesme bucket ----------
insert into storage.buckets (id, name, public)
values ('satis-sozlesme', 'satis-sozlesme', false)
on conflict do nothing;

drop policy if exists satis_soz_sel on storage.objects;
create policy satis_soz_sel on storage.objects for select
  using (bucket_id = 'satis-sozlesme' and is_staff());
drop policy if exists satis_soz_ins on storage.objects;
create policy satis_soz_ins on storage.objects for insert
  with check (bucket_id = 'satis-sozlesme' and is_staff());
drop policy if exists satis_soz_del on storage.objects;
create policy satis_soz_del on storage.objects for delete
  using (bucket_id = 'satis-sozlesme' and is_staff());

-- ---------- 4. Paylaşım ----------
alter table musteri_paylasim_linkleri
  drop constraint if exists musteri_paylasim_linkleri_belge_tipi_check;
alter table musteri_paylasim_linkleri
  add constraint musteri_paylasim_linkleri_belge_tipi_check
  check (belge_tipi in ('teklif', 'servis_raporu', 'demo_tutanak', 'bayi_sozlesme', 'satis_sozlesme'));

create or replace function paylasim_satis_sozlesme_oku(in_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_belge_id   bigint;
  v_belge_tipi text;
  v_sonuc      json;
begin
  select belge_id, belge_tipi into v_belge_id, v_belge_tipi
  from musteri_paylasim_linkleri
  where token = in_token
    and son_kullanma > now();

  if v_belge_id is null or v_belge_tipi <> 'satis_sozlesme' then
    return null;
  end if;

  select json_build_object(
    'id', s.id,
    'sozlesme_no', s.sozlesme_no,
    'olusturma_tarih', s.olusturma_tarih,
    'firma_adi', s.firma_adi,
    'proje_adi', s.proje_adi,
    'durum', s.durum,
    'uretilen_icerik', s.uretilen_icerik
  ) into v_sonuc
  from satis_sozlesmeleri s
  where s.id = v_belge_id;

  return v_sonuc;
end;
$$;

revoke all on function paylasim_satis_sozlesme_oku(text) from public;
grant execute on function paylasim_satis_sozlesme_oku(text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
