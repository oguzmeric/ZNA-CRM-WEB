-- BIRLESTIRME ADIM 1/2 — mobilin GERCEK malzeme akisini musteri formuna bagla.
--
-- Tespit (2026-07-15): teknisyenler malzemeyi MOBILDEN takip ediyor
-- (servis_malzeme_plani 4 satir + servis_kalem_kullanimi 6 satir), web'in
-- servis_malzemeleri tablosu mig 170'e kadar 0 satirdi. Ama musteri formunu
-- besleyen yedek_parcalar YALNIZCA web tablosundan turetiliyordu → mobilden
-- takip edilen malzemelerin HICBIRI forma girmiyordu.
--
-- Kanit: TLP-2026-0022'de teknisyen 1 adet SKYHAWK 8TB teslim almis, servis
-- 'tamamlandi', musteriye giden formda yedek parca satiri: 0.
-- 4 plan satirinin 4'u de forma ulasmiyordu.
--
-- Eslesme (canli veriden dogrulandi, tahmin degil):
--   * kullanilan_miktar 4 satirin 4'unde de 0 — kullanilmiyor.
--   * Gercek terminal adim "Teslim Al": S/N okutulmadan servis KAPATILAMIYOR
--     (ServisTalebiDetayScreen "Eksik Teslim Alma" engeli).
--   * Mobilin kendi (olu) malzemeleriFiltrele'si de ayni kurali soyluyordu:
--     teslim_alinan > 0 veya kullanilan > 0 → forma girer.
--   => teslim_alinan_miktar > 0 olan plan satiri musteri formuna basilir.
--
-- Mimari: yedek_parcalar'in TEK YAZARI hala trigger. Trigger iki kaynaktan
-- OKUR (web tablosu + mobil plan tablosu). Iki bagimsiz YAZAR yok — mig 171'de
-- sorun cikaran desen buydu. Adim 2'de mobil de servis_malzemeleri'ne gecince
-- bu fonksiyondan mobil kolu dusecek.

-- Fiyat: plan tablosunda fiyat YOK. Stok kartindaki satis fiyatindan (birim_fiyat)
-- alinir; yoksa 0. (Kullanici karari: "Fiyatlar gorunsun — stok satis fiyati gelir".)
create or replace function servis_yedek_parca_uret(p_servis bigint)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with web as (
    select m.siralama                              as sira,
           m.id                                    as ikincil,
           m.urun_adi || coalesce(' — S/N: ' || m.seri_no, '') as aciklama,
           m.birim_fiyat,
           m.miktar,
           m.tutar
      from servis_malzemeleri m
     where m.servis_id = p_servis
       and m.durum = 'kullanildi'
  ),
  mobil as (
    select 1000 + p.id                             as sira,   -- web satirlarindan sonra
           p.id                                    as ikincil,
           p.stok_adi || coalesce(' — S/N: ' || sn.seriler, '') as aciklama,
           coalesce(u.birim_fiyat, 0)              as birim_fiyat,
           p.teslim_alinan_miktar                  as miktar,
           round(coalesce(u.birim_fiyat, 0) * p.teslim_alinan_miktar, 2) as tutar
      from servis_malzeme_plani p
      left join stok_urunler u on u.stok_kodu = p.stok_kodu
      left join lateral (
             select string_agg(k.seri_no, ', ' order by k.seri_no) as seriler
               from servis_kalem_kullanimi kk
               join stok_kalemleri k on k.id = kk.kalem_id
              where kk.plan_id = p.id
                and kk.durum = 'teslim_alindi'
           ) sn on true
     where p.servis_talep_id = p_servis
       and coalesce(p.teslim_alinan_miktar, 0) > 0
  ),
  hepsi as (select * from web union all select * from mobil)
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'aciklama',    aciklama,
               'birim_fiyat', birim_fiyat,
               'miktar',      miktar,
               'tutar',       tutar,
               'kaynak',      'malzeme'
             ) order by sira, ikincil
           ), '[]'::jsonb)
    from hepsi;
$$;

-- Ortak senkron: hangi tablodan tetiklenirse tetiklensin ayni sonucu yazar.
-- Isaretsiz (eski mobil uygulamanin elle yazdigi) satirlar mig 171'deki gibi KORUNUR.
create or replace function servis_yedek_parca_yaz(p_servis bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_elle jsonb;
begin
  select coalesce(jsonb_agg(e.p order by e.sira), '[]'::jsonb)
    into v_elle
    from servis_talepleri t
    cross join lateral jsonb_array_elements(coalesce(t.yedek_parcalar, '[]'::jsonb))
                 with ordinality as e(p, sira)
   where t.id = p_servis
     and coalesce(e.p->>'kaynak', '') <> 'malzeme';

  update servis_talepleri
     set yedek_parcalar = servis_yedek_parca_uret(p_servis) || v_elle
   where id = p_servis;
end $$;

-- servis_malzemeleri (web) tetikleyicisi
create or replace function servis_yedek_parca_senkron()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform servis_yedek_parca_yaz(coalesce(new.servis_id, old.servis_id));
  return null;
end $$;

-- servis_malzeme_plani (mobil) tetikleyicisi
create or replace function servis_plan_yedek_parca_senkron()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform servis_yedek_parca_yaz(coalesce(new.servis_talep_id, old.servis_talep_id));
  return null;
end $$;

drop trigger if exists trg_servis_plan_yedek_parca on servis_malzeme_plani;
create trigger trg_servis_plan_yedek_parca
  after insert or update or delete on servis_malzeme_plani
  for each row execute function servis_plan_yedek_parca_senkron();

-- servis_kalem_kullanimi (mobil S/N okutma) — S/N aciklamaya islensin
create or replace function servis_kalem_yedek_parca_senkron()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform servis_yedek_parca_yaz(coalesce(new.servis_talep_id, old.servis_talep_id));
  return null;
end $$;

drop trigger if exists trg_servis_kalem_yedek_parca on servis_kalem_kullanimi;
create trigger trg_servis_kalem_yedek_parca
  after insert or update or delete on servis_kalem_kullanimi
  for each row execute function servis_kalem_yedek_parca_senkron();

-- Gecmisi duzelt: mobilden malzeme takip edilmis ama formu bos basmis talepler.
-- Imzali/gonderilmis belge degil — yedek_parcalar turetilmis bir alan.
update servis_talepleri t
   set yedek_parcalar = servis_yedek_parca_uret(t.id) || coalesce((
         select jsonb_agg(e.p order by e.sira)
           from jsonb_array_elements(coalesce(t.yedek_parcalar, '[]'::jsonb))
                with ordinality as e(p, sira)
          where coalesce(e.p->>'kaynak', '') <> 'malzeme'
       ), '[]'::jsonb)
 where exists (
         select 1 from servis_malzeme_plani p
          where p.servis_talep_id = t.id and coalesce(p.teslim_alinan_miktar,0) > 0
       );

notify pgrst, 'reload schema';
