-- Mig 170'in trigger'i yedek_parcalar'i BASTAN kuruyordu. Ama mobil uygulama
-- (crm-mobile ServisFormBilgileriCard) bu kolona hala ELLE yaziyor ve orada
-- kart her durumda acik. Sonuc: teknisyen mobilden parca yazar, ardindan biri
-- web'den malzeme eklerse (veya kesiften gelen "Kullandim" derse) mobilin
-- yazdigi satir SESSIZCE siliniyordu. Rollback'li testle uretildi: 2 satir
-- beklenirken 1 kaldi, mobil satiri yok oldu.
--
-- Mobil surum cikana kadar (birlestirme isi ayrica yapiliyor) eski uygulamayi
-- kullanan teknisyenler yazmaya devam edecek. Bu yuzden trigger artik EZMIYOR,
-- BIRLESTIRIYOR:
--   * kendi urettigi satirlari 'kaynak':'malzeme' ile isaretler ve yalnizca
--     onlari tazeler,
--   * isareti olmayan (mobilden elle yazilmis) satirlara DOKUNMAZ.
--
-- Not: 'kaynak' anahtari cikti sablonlarini etkilemez — web ServisFormu ve
-- mobil servisFormuHtml yalnizca aciklama/birim_fiyat/miktar/tutar okur.

create or replace function servis_yedek_parca_senkron()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_servis   bigint;
  v_uretilen jsonb;
  v_elle     jsonb;
begin
  v_servis := coalesce(new.servis_id, old.servis_id);

  -- 1) servis_malzemeleri'nden turetilen satirlar (isaretli)
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'aciklama',    m.urun_adi || coalesce(' — S/N: ' || m.seri_no, ''),
               'birim_fiyat', m.birim_fiyat,
               'miktar',      m.miktar,
               'tutar',       m.tutar,
               'kaynak',      'malzeme'
             )
             order by m.siralama, m.id
           ), '[]'::jsonb)
    into v_uretilen
    from servis_malzemeleri m
   where m.servis_id = v_servis
     and m.durum = 'kullanildi';

  -- 2) Bu tablodan GELMEYEN satirlar (mobilden elle yazilmis) — aynen korunur
  select coalesce(jsonb_agg(p order by sira), '[]'::jsonb)
    into v_elle
    from servis_talepleri t
    cross join lateral jsonb_array_elements(coalesce(t.yedek_parcalar, '[]'::jsonb))
                 with ordinality as e(p, sira)
   where t.id = v_servis
     and coalesce(e.p->>'kaynak', '') <> 'malzeme';

  update servis_talepleri
     set yedek_parcalar = v_uretilen || v_elle
   where id = v_servis;

  return null;
end $$;

-- Mevcut satirlarda 'kaynak' isareti YOK. Isaretsiz birakilirsa trigger onlari
-- "elle yazilmis" sanip korur ve turetilen kopyayi da ekler => CIFTLENME.
-- Bu yuzden malzeme satiri olan talepleri bir kez baştan uret (isaretli).
-- Canlida tek talep var (TLP-2026-0016) ve oradaki satir zaten mig 170'te
-- tabloya tasinan satirin ta kendisi — kayip olmaz.
update servis_talepleri t
   set yedek_parcalar = coalesce((
         select jsonb_agg(
                  jsonb_build_object(
                    'aciklama',    m.urun_adi || coalesce(' — S/N: ' || m.seri_no, ''),
                    'birim_fiyat', m.birim_fiyat,
                    'miktar',      m.miktar,
                    'tutar',       m.tutar,
                    'kaynak',      'malzeme'
                  )
                  order by m.siralama, m.id
                )
           from servis_malzemeleri m
          where m.servis_id = t.id
            and m.durum = 'kullanildi'
       ), '[]'::jsonb)
 where exists (select 1 from servis_malzemeleri m where m.servis_id = t.id);

comment on column servis_talepleri.yedek_parcalar is
  'KARMA: kaynak=malzeme olan satirlar servis_malzemeleri''nden trigger ile TURETILIR (elle yazmayin, uzerine yazilir). Isaretsiz satirlar eski mobil uygulamanin elle girdileridir ve trigger onlara dokunmaz (mig 171). Hedef: mobil de servis_malzemeleri''ne gecince isaretsiz satir kalmayacak.';

notify pgrst, 'reload schema';
