-- 192: Kullanılan Malzeme & Faturalama Takip Modülü v2 — F1 veri temeli (madde 23)
-- Birleşik malzeme_hareketleri tablosu: sipariş kalemleri + servis malzemeleri +
-- manuel/demo/numune teslimleri tek yerde, fatura durumu kalem bazında izlenir.
-- Kayıtlar SİLİNMEZ (delete policy yok) — yalnız aktif=false (iptal/pasif).

create table if not exists malzeme_hareketleri (
  id                 bigint generated always as identity primary key,
  kaynak             text not null default 'manuel' check (kaynak in
                       ('siparis','servis','on_siparis','manuel','demo','numune','garanti_degisim','ucretli_degisim')),
  siparis_id         bigint,
  siparis_kalem_id   bigint unique,      -- kalem başına TEK hareket (çift faturalama engeli)
  servis_id          bigint,
  servis_malzeme_id  bigint unique,
  kaynak_no          text,               -- ZNA-SIP-... / TAL-... görünür numara
  musteri_id         bigint,
  musteri_ad         text,
  urun_ad            text not null,
  model              text,
  stok_kodu          text,
  seri_no            text,
  miktar             numeric not null default 1 check (miktar > 0),
  birim              text default 'Adet',
  birim_fiyat        numeric,
  para_birimi        text default 'TL',
  kdv_orani          numeric,
  teslim_tarihi      timestamptz,
  teslim_sekli       text,
  teslim_alan        text,
  islemi_yapan       text,
  teknisyen          text,
  fatura_durumu      text not null default 'fatura_bekliyor' check (fatura_durumu in
                       ('fatura_bekliyor','proforma_hazirlandi','proforma_gonderildi','musteri_onayi_bekleniyor',
                        'faturaya_hazir','kismen_faturalandi','faturalandi','fatura_iptal',
                        'ucretsiz','garanti','demo_numune','iade','faturalandirilmayacak')),
  faturalanan_miktar numeric not null default 0 check (faturalanan_miktar >= 0),
  proforma_talep_id  bigint,
  proforma_no        text,
  fatura_no          text,
  fatura_tarihi      date,
  aciklama           text,
  onaylayan_ad       text,               -- "faturalandırılmayacak" yönetici onayı
  aktif              boolean not null default true,
  islem_gecmisi      jsonb not null default '[]'::jsonb,
  olusturma_tarih    timestamptz not null default now(),
  guncelleme_tarih   timestamptz not null default now(),
  constraint chk_faturalanan_asim check (faturalanan_miktar <= miktar)
);

create index if not exists idx_mh_musteri  on malzeme_hareketleri (musteri_id) where aktif;
create index if not exists idx_mh_durum    on malzeme_hareketleri (fatura_durumu) where aktif;
create index if not exists idx_mh_siparis  on malzeme_hareketleri (siparis_id);
create index if not exists idx_mh_servis   on malzeme_hareketleri (servis_id);

-- RLS: personel okur/yazar; DELETE policy bilinçli olarak YOK (kayıt silinemez)
alter table malzeme_hareketleri enable row level security;
drop policy if exists mh_select on malzeme_hareketleri;
create policy mh_select on malzeme_hareketleri for select to authenticated using (true);
drop policy if exists mh_insert on malzeme_hareketleri;
create policy mh_insert on malzeme_hareketleri for insert to authenticated with check (true);
drop policy if exists mh_update on malzeme_hareketleri;
create policy mh_update on malzeme_hareketleri for update to authenticated using (true) with check (true);

-- guncelleme_tarih otomatik
create or replace function mh_guncelleme_tarih() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.guncelleme_tarih := now();
  return new;
end $$;
drop trigger if exists trg_mh_guncelleme on malzeme_hareketleri;
create trigger trg_mh_guncelleme before update on malzeme_hareketleri
  for each row execute function mh_guncelleme_tarih();

-- ── Otomatik besleme 1: sipariş kalemi eklenince hareket oluştur ────────────
create or replace function mh_siparis_kaleminden() returns trigger
language plpgsql security definer set search_path = public as $$
declare s record;
begin
  select siparis_no, musteri_id, para_birimi, tamamlanma_tarihi into s
    from siparisler where id = new.siparis_id;
  insert into malzeme_hareketleri
    (kaynak, siparis_id, siparis_kalem_id, kaynak_no, musteri_id, musteri_ad,
     urun_ad, model, stok_kodu, miktar, birim, birim_fiyat, para_birimi, kdv_orani,
     teslim_tarihi, islem_gecmisi)
  select 'siparis', new.siparis_id, new.id, s.siparis_no, s.musteri_id,
         coalesce(m.firma, trim(coalesce(m.ad,'') || ' ' || coalesce(m.soyad,''))),
         new.urun_ad, new.urun_model, new.stok_kodu, new.miktar,
         coalesce(new.birim,'Adet'), new.birim_fiyat, coalesce(s.para_birimi,'TL'), new.kdv_orani,
         s.tamamlanma_tarihi,
         jsonb_build_array(jsonb_build_object('t', now(), 'islem', 'olusturuldu',
           'detay', 'Sipariş ' || coalesce(s.siparis_no,'') || ' kaleminden otomatik'))
  from (select 1) x
  left join musteriler m on m.id = s.musteri_id
  on conflict (siparis_kalem_id) do nothing;
  return new;
end $$;
drop trigger if exists trg_mh_siparis_kalem on siparis_kalemleri;
create trigger trg_mh_siparis_kalem after insert on siparis_kalemleri
  for each row execute function mh_siparis_kaleminden();

-- Kalem güncellenirse (miktar/fiyat) faturasız hareketi senkonla; silinirse pasifle
create or replace function mh_siparis_kalem_senkron() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    update malzeme_hareketleri
       set miktar = new.miktar, birim_fiyat = new.birim_fiyat,
           urun_ad = new.urun_ad, model = new.urun_model, stok_kodu = new.stok_kodu
     where siparis_kalem_id = new.id
       and fatura_durumu in ('fatura_bekliyor','faturaya_hazir')
       and faturalanan_miktar = 0;
    return new;
  elsif tg_op = 'DELETE' then
    update malzeme_hareketleri
       set aktif = false,
           islem_gecmisi = islem_gecmisi || jsonb_build_array(jsonb_build_object(
             't', now(), 'islem', 'pasife_alindi', 'detay', 'Sipariş kalemi silindi'))
     where siparis_kalem_id = old.id and fatura_durumu = 'fatura_bekliyor' and faturalanan_miktar = 0;
    return old;
  end if;
  return null;
end $$;
drop trigger if exists trg_mh_siparis_kalem_senkron on siparis_kalemleri;
create trigger trg_mh_siparis_kalem_senkron after update or delete on siparis_kalemleri
  for each row execute function mh_siparis_kalem_senkron();

-- ── Otomatik besleme 2: servis malzemesi eklenince hareket oluştur ──────────
create or replace function mh_servis_malzemesinden() returns trigger
language plpgsql security definer set search_path = public as $$
declare t record;
begin
  select talep_no, musteri_id, musteri_ad into t
    from servis_talepleri where id = new.servis_id;
  insert into malzeme_hareketleri
    (kaynak, servis_id, servis_malzeme_id, kaynak_no, musteri_id, musteri_ad,
     urun_ad, stok_kodu, seri_no, miktar, birim, birim_fiyat, para_birimi,
     teknisyen, teslim_tarihi, islem_gecmisi)
  values
    ('servis', new.servis_id, new.id, t.talep_no, t.musteri_id, t.musteri_ad,
     new.urun_adi, new.stok_kodu, new.seri_no, coalesce(new.miktar,1),
     coalesce(new.birim,'Adet'), new.birim_fiyat, 'TL',
     new.kullanici_ad, new.tarih,
     jsonb_build_array(jsonb_build_object('t', now(), 'islem', 'olusturuldu',
       'detay', 'Servis ' || coalesce(t.talep_no,'') || ' malzemesinden otomatik')))
  on conflict (servis_malzeme_id) do nothing;
  return new;
end $$;
drop trigger if exists trg_mh_servis_malzeme on servis_malzemeleri;
create trigger trg_mh_servis_malzeme after insert on servis_malzemeleri
  for each row execute function mh_servis_malzemesinden();

-- Servis malzemesi silinirse hareketi pasifle (faturasızsa)
create or replace function mh_servis_malzeme_sil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update malzeme_hareketleri
     set aktif = false,
         islem_gecmisi = islem_gecmisi || jsonb_build_array(jsonb_build_object(
           't', now(), 'islem', 'pasife_alindi', 'detay', 'Servis malzemesi silindi'))
   where servis_malzeme_id = old.id and fatura_durumu = 'fatura_bekliyor' and faturalanan_miktar = 0;
  return old;
end $$;
drop trigger if exists trg_mh_servis_malzeme_sil on servis_malzemeleri;
create trigger trg_mh_servis_malzeme_sil after delete on servis_malzemeleri
  for each row execute function mh_servis_malzeme_sil();

-- ── Otomatik besleme 3: proforma / fatura senkronu ─────────────────────────
-- fatura_talepleri INSERT → ilgili sipariş/servis hareketleri "proforma_hazirlandi"
-- fatura_no kaydedilince → "faturalandi" (+ fatura no/tarih, tam miktar)
-- NOT: proforma akışı çoğunlukla TEKLİFTEN açılır — sipariş bağı
-- fatura_talepleri.siparis_id yerine teklif_id üzerinden kurulur
-- (siparisler.teklif_id). Üç eşleşme yolu da desteklenir.
create or replace function mh_fatura_senkron() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update malzeme_hareketleri
       set fatura_durumu = 'proforma_hazirlandi',
           proforma_talep_id = new.id, proforma_no = new.talep_no,
           islem_gecmisi = islem_gecmisi || jsonb_build_array(jsonb_build_object(
             't', now(), 'islem', 'proforma', 'detay',
             'Proforma ' || coalesce(new.talep_no,'') || ' oluşturuldu (' || coalesce(new.talep_eden_ad,'') || ')'))
     where aktif
       and fatura_durumu in ('fatura_bekliyor','faturaya_hazir')
       and ((new.siparis_id is not null and siparis_id = new.siparis_id)
         or (new.servis_talep_id is not null and servis_id = new.servis_talep_id)
         or (new.teklif_id is not null and siparis_id in
              (select id from siparisler where teklif_id = new.teklif_id)));
    return new;
  end if;

  -- UPDATE: resmî fatura kesildi
  if new.fatura_no is not null and coalesce(old.fatura_no,'') <> new.fatura_no then
    update malzeme_hareketleri
       set fatura_durumu = 'faturalandi',
           faturalanan_miktar = miktar,
           fatura_no = new.fatura_no, fatura_tarihi = new.fatura_tarihi,
           islem_gecmisi = islem_gecmisi || jsonb_build_array(jsonb_build_object(
             't', now(), 'islem', 'faturalandi', 'detay',
             'Fatura ' || new.fatura_no || ' (' || coalesce(new.faturalayan_ad,'') || ')'))
     where aktif
       and fatura_durumu not in ('faturalandi','iade','faturalandirilmayacak','ucretsiz','garanti','demo_numune')
       and (proforma_talep_id = new.id
         or (new.siparis_id is not null and siparis_id = new.siparis_id)
         or (new.servis_talep_id is not null and servis_id = new.servis_talep_id)
         or (new.teklif_id is not null and siparis_id in
              (select id from siparisler where teklif_id = new.teklif_id)));
  end if;
  return new;
end $$;
drop trigger if exists trg_mh_fatura_senkron on fatura_talepleri;
create trigger trg_mh_fatura_senkron after insert or update on fatura_talepleri
  for each row execute function mh_fatura_senkron();

-- ── Geriye dönük aktarım (idempotent — on conflict do nothing) ──────────────
-- 1) Mevcut sipariş kalemleri (iptal siparişler pasif gelir)
insert into malzeme_hareketleri
  (kaynak, siparis_id, siparis_kalem_id, kaynak_no, musteri_id, musteri_ad,
   urun_ad, model, stok_kodu, miktar, birim, birim_fiyat, para_birimi, kdv_orani,
   teslim_tarihi, aktif, olusturma_tarih, islem_gecmisi)
select 'siparis', k.siparis_id, k.id, s.siparis_no, s.musteri_id,
       coalesce(m.firma, trim(coalesce(m.ad,'') || ' ' || coalesce(m.soyad,''))),
       k.urun_ad, k.urun_model, k.stok_kodu, greatest(k.miktar, 0.001),
       coalesce(k.birim,'Adet'), k.birim_fiyat, coalesce(s.para_birimi,'TL'), k.kdv_orani,
       s.tamamlanma_tarihi, (s.durum is distinct from 'iptal'), k.olusturma_tarih,
       jsonb_build_array(jsonb_build_object('t', now(), 'islem', 'olusturuldu', 'detay',
         'Geriye dönük aktarım — sipariş ' || coalesce(s.siparis_no,'')))
from siparis_kalemleri k
join siparisler s on s.id = k.siparis_id
left join musteriler m on m.id = s.musteri_id
on conflict (siparis_kalem_id) do nothing;

-- 2) Mevcut servis malzemeleri
insert into malzeme_hareketleri
  (kaynak, servis_id, servis_malzeme_id, kaynak_no, musteri_id, musteri_ad,
   urun_ad, stok_kodu, seri_no, miktar, birim, birim_fiyat, para_birimi,
   teknisyen, teslim_tarihi, olusturma_tarih, islem_gecmisi)
select 'servis', sm.servis_id, sm.id, t.talep_no, t.musteri_id, t.musteri_ad,
       sm.urun_adi, sm.stok_kodu, sm.seri_no, greatest(coalesce(sm.miktar,1), 0.001),
       coalesce(sm.birim,'Adet'), sm.birim_fiyat, 'TL',
       sm.kullanici_ad, sm.tarih, coalesce(sm.tarih, now()),
       jsonb_build_array(jsonb_build_object('t', now(), 'islem', 'olusturuldu', 'detay',
         'Geriye dönük aktarım — servis ' || coalesce(t.talep_no,'')))
from servis_malzemeleri sm
join servis_talepleri t on t.id = sm.servis_id
on conflict (servis_malzeme_id) do nothing;

-- 3) Fatura köprüsünden durumları geriye dönük işle (sipariş/servis/teklif yolu)
--    a) Proforma oluşturulmuş ama fatura kesilmemiş
update malzeme_hareketleri h
   set fatura_durumu = 'proforma_hazirlandi', proforma_talep_id = f.id, proforma_no = f.talep_no
  from fatura_talepleri f
  left join siparisler ts on f.teklif_id is not null and ts.teklif_id = f.teklif_id
 where h.aktif and h.fatura_durumu = 'fatura_bekliyor'
   and f.fatura_no is null and f.durum is distinct from 'reddedildi'
   and ((f.siparis_id is not null and h.siparis_id = f.siparis_id)
     or (f.servis_talep_id is not null and h.servis_id = f.servis_talep_id)
     or (ts.id is not null and h.siparis_id = ts.id));
--    b) Faturası kesilmiş
update malzeme_hareketleri h
   set fatura_durumu = 'faturalandi', faturalanan_miktar = h.miktar,
       fatura_no = f.fatura_no, fatura_tarihi = f.fatura_tarihi,
       proforma_talep_id = f.id, proforma_no = f.talep_no
  from fatura_talepleri f
  left join siparisler ts on f.teklif_id is not null and ts.teklif_id = f.teklif_id
 where h.aktif and f.fatura_no is not null
   and h.fatura_durumu in ('fatura_bekliyor','proforma_hazirlandi')
   and ((f.siparis_id is not null and h.siparis_id = f.siparis_id)
     or (f.servis_talep_id is not null and h.servis_id = f.servis_talep_id)
     or (ts.id is not null and h.siparis_id = ts.id));

notify pgrst, 'reload schema';
select 'mig 192 tamam',
  (select count(*) from malzeme_hareketleri) as toplam,
  (select count(*) from malzeme_hareketleri where fatura_durumu = 'faturalandi') as faturalanan,
  (select count(*) from malzeme_hareketleri where fatura_durumu = 'proforma_hazirlandi') as proformali,
  (select count(*) from malzeme_hareketleri where not aktif) as pasif;
